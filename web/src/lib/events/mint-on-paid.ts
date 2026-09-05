import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { seatLostLines } from "@/lib/events/ticket-purchase";
import { planAdmissions } from "@/lib/events/mint-admissions";

/**
 * Mint admissions for a settled order.
 *
 * Subscribed to Orders' `onOrderPaid` seam at the `markPaid` call site. Orders
 * imports nothing from here; the composition lives in the caller that already
 * knows about both.
 *
 * BEST EFFORT, AND SAFE ONLY BECAUSE OF THE RECONCILER. Orders catches and logs
 * whatever this throws and settles the order regardless — correctly, because a
 * ticketing failure must not turn a completed payment into a webhook Stripe
 * retries against work already done. What makes that acceptable rather than
 * merely convenient is `admissions_mint_shortfall`, which is already on main:
 * a paid, session-backed line with fewer admissions than it sold shows up as a
 * row a cron can find, instead of as a person at a door with a receipt and no
 * ticket.
 *
 * IDEMPOTENT BY CONSTRAINT, NOT BY CHECK-THEN-INSERT. `(order_line_id, line_seq)`
 * is unique, so a retry conflicts rather than double-minting. That matters here
 * specifically: this runs on a Stripe webhook, which retries.
 */

export type MintOnPaidCtx = {
  orderId: string;
  tenantId: string;
  lines: Array<{
    id: string;
    units: number;
    sessionId: string | null;
    variantId: string | null;
  }>;
};

export type MintOutcome = {
  linesConsidered: number;
  linesMinted: number;
  rowsInserted: number;
  skipped: Array<{ lineId: string; reason: string }>;
};

/**
 * How many people one unit of this tier admits.
 *
 * Read from the variant, defaulting to 1 when a line has no variant — a plain
 * ticket admits one person. NOT derived from `consumes_units`, which answers
 * how much POOL a purchase eats: a VIP table consumes one table and admits six.
 */
async function admitsPerUnitFor(
  admin: SupabaseClient,
  variantIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (variantIds.length === 0) return out;

  const { data, error } = await admin
    .from("talent_offering_variants")
    .select("id, admits_per_unit")
    .in("id", variantIds as string[]);

  if (error) {
    // Named and rethrown rather than defaulted to 1. Silently admitting one
    // person per unit would seat a table of six as a single guest, and the
    // shortfall view cannot see that: the ROW COUNT would be correct and only
    // the party sizes wrong. A refusal the reconciler CAN see is better than a
    // wrong number it cannot.
    throw new Error(`mint-on-paid: could not read tier admits_per_unit: ${error.message}`);
  }

  for (const v of data ?? []) {
    out.set(v.id as string, Number((v as { admits_per_unit: number | string }).admits_per_unit));
  }
  return out;
}

export async function mintAdmissionsForPaidOrder(
  admin: SupabaseClient,
  ctx: MintOnPaidCtx,
): Promise<MintOutcome> {
  // Only session-backed lines mint. A taco has no admission, and
  // `order_lines.session_id` is the binding — never `orders.session_id`, which
  // can name only one session on an order that may hold two.
  const ticketLines = ctx.lines.filter((l) => Boolean(l.sessionId));
  const outcome: MintOutcome = {
    linesConsidered: ticketLines.length,
    linesMinted: 0,
    rowsInserted: 0,
    skipped: [],
  };
  if (ticketLines.length === 0) return outcome;

  const variantIds = [
    ...new Set(ticketLines.map((l) => l.variantId).filter((v): v is string => Boolean(v))),
  ];
  const admitsByVariant = await admitsPerUnitFor(admin, variantIds);

  // Allocations already committed for these lines. The admission points at the
  // allocation that paid for it, so refund-by-line can free exactly its units.
  const { data: allocRows, error: allocErr } = await admin
    .from("capacity_allocations")
    .select("id, order_line_id, created_at")
    .in(
      "order_line_id",
      ticketLines.map((l) => l.id),
    )
    .eq("state", "committed")
    // Deterministic unit order, so a webhook retry maps the same allocation to
    // the same `line_seq`. `id` breaks a created_at tie (one batch, one clock).
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (allocErr) {
    throw new Error(`mint-on-paid: could not read allocations: ${allocErr.message}`);
  }
  // ALL allocations per line, in order. Orders reserves one allocation per
  // unit when the purchase declares `perUnitDomainRow` (#1717), and one row
  // of N otherwise; the planner tells the two apart by count.
  const allocsByLine = new Map<string, string[]>();
  for (const a of allocRows ?? []) {
    const lineId = a.order_line_id as string | null;
    if (!lineId) continue;
    allocsByLine.set(lineId, [...(allocsByLine.get(lineId) ?? []), a.id as string]);
  }

  const rows: Array<Record<string, unknown>> = [];

  // PAYMENT CAN LAND AFTER THE HOLD LAPSED. `completeOrderForTransaction`
  // refuses to revive a lapsed hold and still flips the order to paid (its
  // DECISION 2). A ticket line with NO committed allocation must not become a
  // ticket for a seat that does not exist: it mints nothing and becomes a
  // refund intent, executed by a separate cron where the result is
  // inspectable (design §5b.0). This hook never calls the refund executor —
  // its catch-all would swallow the one outcome that needs a person.
  const lost = seatLostLines(ticketLines, allocsByLine);
  if (lost.length > 0) {
    const { error: intentErr } = await admin.from("ticket_refund_intents").upsert(
      lost.map((lineId) => ({ tenant_id: ctx.tenantId, order_id: ctx.orderId, order_line_id: lineId, reason: "seat_lost_after_payment" })),
      { onConflict: "order_line_id", ignoreDuplicates: true },
    );
    if (intentErr) {
      // Loud: a lost seat with no recorded intent is a customer charged for
      // nothing and nobody told. The mint still refuses the line below.
      logServerError("events.mintOnPaid/SEAT_LOST_INTENT_WRITE_FAILED", `${intentErr.message} order=${ctx.orderId} lines=${lost.join(",")}`);
    }
    for (const lineId of lost) outcome.skipped.push({ lineId, reason: "seat_lost_after_payment" });
  }
  const lostSet = new Set(lost);

  for (const line of ticketLines) {
    if (lostSet.has(line.id)) continue;
    // No sentinel key: a line with no variant has NO variant entry, not the
    // entry of the empty string.
    const admitsPerUnit = line.variantId ? (admitsByVariant.get(line.variantId) ?? 1) : 1;

    const plan = planAdmissions({
      orderLineId: line.id,
      units: line.units,
      admitsPerUnit,
      sessionId: line.sessionId,
      allocationId: allocsByLine.get(line.id)?.[0] ?? null,
      allocationIds: allocsByLine.get(line.id),
    });

    if (!plan.ok) {
      // Recorded rather than thrown: one malformed line must not stop the
      // others minting, and the shortfall view will still report this one.
      outcome.skipped.push({ lineId: line.id, reason: plan.reason });
      continue;
    }

    outcome.linesMinted += 1;
    plan.rows.forEach((r, seq) => {
      rows.push({
        tenant_id: ctx.tenantId,
        order_line_id: r.orderLineId,
        // The ordinal WITHIN the line. `(order_line_id, line_seq)` is unique,
        // which is what makes a webhook retry a no-op instead of a double mint.
        line_seq: seq,
        allocation_id: r.allocationId,
        session_id: r.sessionId,
        party_size: r.partySize,
      });
    });
  }

  if (rows.length === 0) return outcome;

  // `ignoreDuplicates` is the retry path: a re-delivered webhook re-inserts the
  // same (line, seq) pairs and they conflict away silently, which is the point.
  const { error: insertErr, count } = await admin
    .from("admissions")
    .upsert(rows, { onConflict: "order_line_id,line_seq", ignoreDuplicates: true, count: "exact" });

  if (insertErr) {
    throw new Error(`mint-on-paid: admissions insert failed: ${insertErr.message}`);
  }

  outcome.rowsInserted = count ?? 0;

  if (outcome.skipped.length > 0) {
    logServerError(
      "events.mintOnPaid/skippedLines",
      `order ${ctx.orderId}: ${outcome.skipped.length} line(s) skipped — ` +
        outcome.skipped.map((s) => `${s.lineId}:${s.reason}`).join(", "),
    );
  }

  return outcome;
}
