import "server-only";

/**
 * stale-payout-hold-alert.ts — a refund-pending payout hold that stays held raises an alert (TUL-1746).
 *
 * executeBookingTransfers holds a payout while Stripe shows a refund our ledger has not recorded. The
 * reconcile cron re-runs those holds; one that is STILL held after STALE_HOLD_DAYS means the refund never
 * landed in our ledger (a missed webhook) or something else is wrong, and a log line is not enough. The alert
 * goes through the existing ops path: a `platform_alerts` row (the usage-audit table, deduped per day +
 * category + content) and a best-effort email to the same recipient the usage audit uses.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { REFUND_PENDING_ERROR_PREFIX } from "./balance-payout-refund-net";

export const STALE_HOLD_DAYS = 3;
export const STALE_HOLD_CATEGORY = "payout_refund_pending_stale";
const MAX_LEGS = 200;

type StaleLeg = { id: string; booking_id: string; created_at: string; last_error: string | null };

export async function alertStaleRefundPendingHolds(
  sb: SupabaseClient,
  deps: {
    now?: Date;
    recipient?: string | null;
    sendEmail?: (m: { to: string; subject: string; html: string }) => Promise<unknown>;
  } = {},
): Promise<{ stale: number }> {
  const now = deps.now ?? new Date();
  const cutoff = new Date(now.getTime() - STALE_HOLD_DAYS * 86_400_000).toISOString();
  const { data, error } = await sb
    .from("booking_payouts")
    .select("id, booking_id, created_at, last_error")
    .eq("status", "held")
    .eq("amount_cents", 0)
    .like("last_error", `${REFUND_PENDING_ERROR_PREFIX}%`)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_LEGS);
  if (error) {
    logServerError("payouts.staleRefundHold.read", error);
    return { stale: 0 };
  }
  const legs = (data ?? []) as StaleLeg[];
  if (legs.length === 0) return { stale: 0 };

  const message = `${legs.length} payout hold${legs.length === 1 ? "" : "s"} waiting on a refund to be recorded for more than ${STALE_HOLD_DAYS} days`;
  logServerError("payouts.staleRefundHold", new Error(`${message}: ${legs.map((l) => `${l.id} (booking ${l.booking_id})`).join(", ")}`));

  const hash = createHash("sha256").update(legs.map((l) => l.id).sort().join(",")).digest("hex").slice(0, 32);
  const { error: insertError } = await sb.from("platform_alerts").upsert(
    [
      {
        audit_date: now.toISOString().slice(0, 10),
        severity: "critical",
        category: STALE_HOLD_CATEGORY,
        content_hash: hash,
        payload: { count: legs.length, legs: legs.map((l) => ({ id: l.id, booking_id: l.booking_id, held_since: l.created_at, reason: l.last_error })) },
        message,
      },
    ],
    { onConflict: "audit_date,category,content_hash", ignoreDuplicates: true },
  );
  if (insertError) logServerError("payouts.staleRefundHold.insert", insertError);

  const to = deps.recipient ?? (process.env.USAGE_AUDIT_EMAIL_TO?.trim() || process.env.EMAIL_REPLY_TO?.trim() || null);
  if (to) {
    try {
      const send = deps.sendEmail ?? (await import("@/lib/email")).sendEmail;
      const lines = legs.map((l) => `leg ${l.id} (booking ${l.booking_id}) held since ${l.created_at}`).join("\n");
      await send({ to, subject: `[Tulala] ${message}`, html: `<pre>${message}\n\n${lines}</pre>` });
    } catch (err) {
      logServerError("payouts.staleRefundHold.email", err);
    }
  }
  return { stale: legs.length };
}
