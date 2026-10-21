/**
 * TUL-1294: the balance payout must not pay the talent for money the client got
 * back. Payout legs are per booking and paid once, on the balance/full charge,
 * from the frozen commission snapshot. If the deposit was refunded BEFORE that
 * payout, the snapshot still reads the whole booking, so the talent was paid the
 * full net with part of the client's money already returned.
 *
 * The refunded part of a leg uses the same rule the refund path takes back with
 * (`shareOfLegCents`, charge-share-math.ts): `round(leg * refunded / total
 * charged)`. Refund state comes from `booking_transactions`:
 *  - a fully refunded charge: the charge row itself is `status = 'refunded'`;
 *  - a partial refund: a child row (`refund_of_transaction_id` = the charge,
 *    `status = 'refunded'`) carrying the refunded slice.
 *
 * Pure math here; the caller reads the rows. Never negative; no refund = no change.
 */

import { shareOfLegCents } from "@/lib/payments/charge-share-math";

export type BookingTxnRow = {
  id: string;
  status: string | null;
  gross_amount_cents: number | null;
  refund_of_transaction_id: string | null;
};

/** Charge rows that count toward what the client paid on the booking. */
const CHARGE_STATUSES = new Set(["paid", "payout_pending", "payout_sent", "disputed", "refunded"]);

/** Pure: total charged and total refunded across the booking's charges (minor units). */
export function bookingRefundTotals(rows: readonly BookingTxnRow[]): { chargedCents: number; refundedCents: number } {
  let chargedCents = 0;
  let refundedCents = 0;
  const partialByCharge = new Map<string, number>();
  for (const r of rows) {
    const amount = Math.max(0, r.gross_amount_cents ?? 0);
    if (r.refund_of_transaction_id) {
      if (r.status === "refunded") {
        partialByCharge.set(r.refund_of_transaction_id, (partialByCharge.get(r.refund_of_transaction_id) ?? 0) + amount);
      }
      continue;
    }
    if (!CHARGE_STATUSES.has(r.status ?? "")) continue;
    chargedCents += amount;
    if (r.status === "refunded") refundedCents += amount;
  }
  for (const r of rows) {
    if (r.refund_of_transaction_id || r.status === "refunded") continue;
    const partial = partialByCharge.get(r.id) ?? 0;
    if (partial > 0) refundedCents += Math.min(partial, Math.max(0, r.gross_amount_cents ?? 0));
  }
  return { chargedCents, refundedCents: Math.min(refundedCents, chargedCents) };
}

/** Pure: a talent leg after the refunded share of the booking is taken out (never below 0). */
export function talentCentsNetOfRefunds(
  legCents: number,
  totals: { chargedCents: number; refundedCents: number },
): number {
  const leg = Math.max(0, Math.round(legCents));
  if (totals.refundedCents <= 0 || totals.chargedCents <= 0) return leg;
  const other = totals.chargedCents - totals.refundedCents;
  return Math.max(0, leg - shareOfLegCents(leg, totals.refundedCents, other));
}
