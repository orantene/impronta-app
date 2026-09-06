/**
 * Cron: execute `ticket_refund_intents` — refund a paid ticket line whose
 * seat was lost between payment and settlement (E5 step 1, design §5b.0).
 *
 * Endpoint: GET /api/cron/ticket-refund-intents   (CRON_SECRET bearer auth)
 *
 * WHY THIS IS NOT IN THE PAID HOOK: `onOrderPaid` swallows subscriber errors
 * by design (right for minting). A refund's most important outcome —
 * `partial_failure` with money moved — must not become a log line and an
 * `ok`, and a refund issued microseconds after the charge can be refused by
 * Stripe before settlement. Here the result is inspectable and retryable.
 *
 * CLAIM BEFORE EXECUTE. `executed_at` is written after the refund; a crash
 * between "Stripe refunded" and "row updated", or two overlapping runs, would
 * refund twice. The conditional UPDATE on `claimed_at IS NULL` is the guard;
 * the loser skips. A claimed-but-unexecuted intent is something to look at,
 * never something to redo.
 *
 * OUTCOMES (verbatim from refundOrderLines):
 *   ok                 → executed_at, buyer message recorded (decision 10)
 *   refund_refused     → not settled yet: unclaim, attempts+1, retry next run
 *   partial_failure    → money moved then a leg failed: executed_at set,
 *                        LOUD log — a person reconciles; never retried
 *   other              → executed_at set with the verdict, loud log
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { refundOrderLines } from "@/lib/orders/refund-execute-lines";
import { seatLostMessage } from "@/lib/events/ticket-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 20;
const MAX_ATTEMPTS = 12; // refund_refused retries; ~12 runs before a human looks

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/ticket-refund-intents", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false, error: "no_service_role" }, { status: 503 });

  const { data: pending, error: pErr } = await admin
    .from("ticket_refund_intents")
    .select("id, tenant_id, order_id, order_line_id, attempts")
    .is("executed_at", null)
    .is("claimed_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (pErr) {
    logServerError("cron/ticket-refund-intents/select", pErr);
    return NextResponse.json({ ok: false, error: "select_failed" }, { status: 500 });
  }

  const summary = { claimed: 0, refunded: 0, refused_retry: 0, partial_failure: 0, other: 0, skipped: 0 };

  for (const intent of pending ?? []) {
    const id = intent.id as string;
    // THE GUARD. Zero rows back means another run has it.
    const { data: claimed, error: cErr } = await admin
      .from("ticket_refund_intents")
      .update({ claimed_at: new Date().toISOString(), attempts: Number(intent.attempts) + 1 })
      .eq("id", id)
      .is("claimed_at", null)
      .select("id");
    if (cErr) { logServerError("cron/ticket-refund-intents/claim", cErr); summary.skipped += 1; continue; }
    if (!claimed || claimed.length === 0) { summary.skipped += 1; continue; }
    summary.claimed += 1;

    const [{ data: line, error: lErr }, { data: ev, error: eErr }] = await Promise.all([
      admin.from("order_lines").select("id, session_id, amount_cents, total_cents").eq("id", intent.order_line_id as string).maybeSingle(),
      admin.from("order_lines").select("session_id").eq("id", intent.order_line_id as string).maybeSingle()
        .then(async (r) => {
          const sid = (r.data?.session_id as string | null) ?? null;
          if (!sid) return { data: null, error: r.error };
          const { data: sess, error } = await admin.from("sessions").select("event_id").eq("id", sid).maybeSingle();
          if (error || !sess?.event_id) return { data: null, error };
          return admin.from("events").select("title").eq("id", sess.event_id as string).maybeSingle();
        }),
    ]);
    if (lErr) logServerError("cron/ticket-refund-intents/line", lErr);
    if (eErr) logServerError("cron/ticket-refund-intents/event", eErr);

    const res = await refundOrderLines(admin, {
      orderId: intent.order_id as string,
      lineIds: [intent.order_line_id as string],
      reason: "service_not_delivered",
      actorUserId: null,
      note: "seat_lost_after_payment: the hold lapsed before the payment settled; refunded automatically",
    });

    const now = new Date().toISOString();
    if (res.ok) {
      const cents = Number((line as { total_cents?: unknown } | null)?.total_cents ?? (line as { amount_cents?: unknown } | null)?.amount_cents ?? 0);
      const message = seatLostMessage({ eventTitle: (ev?.title as string | null) ?? null, amountLabel: (cents / 100).toFixed(2) });
      const { error: uErr } = await admin.from("ticket_refund_intents")
        .update({ executed_at: now, result: "ok", result_detail: { buyer_message: message, movedCents: (res as { movedCents?: number }).movedCents ?? null } })
        .eq("id", id);
      if (uErr) logServerError("cron/ticket-refund-intents/finish", uErr);
      summary.refunded += 1;
      continue;
    }
    const reason = (res as { reason?: string }).reason ?? "unknown";
    if (reason === "refund_refused") {
      // Not settled yet. Release the claim so the next run retries.
      const { error: uErr } = await admin.from("ticket_refund_intents")
        .update({ claimed_at: null, result: "refund_refused", result_detail: { last: now } }).eq("id", id);
      if (uErr) logServerError("cron/ticket-refund-intents/unclaim", uErr);
      summary.refused_retry += 1;
      continue;
    }
    if (reason === "partial_failure") {
      logServerError(
        "cron/ticket-refund-intents/PARTIAL_FAILURE_NEEDS_A_PERSON",
        `intent ${id} order ${intent.order_id as string}: money moved (${(res as { movedCents?: number }).movedCents ?? "?"} cents) then a leg failed — reconcile by hand`,
      );
      summary.partial_failure += 1;
    } else {
      logServerError("cron/ticket-refund-intents/failed", `intent ${id}: ${reason}`);
      summary.other += 1;
    }
    const { error: uErr } = await admin.from("ticket_refund_intents")
      .update({ executed_at: now, result: reason, result_detail: res as unknown as Record<string, unknown> }).eq("id", id);
    if (uErr) logServerError("cron/ticket-refund-intents/finish", uErr);
  }

  return NextResponse.json({ ok: true, ...summary });
}
