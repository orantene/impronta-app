/**
 * E5 (TUL-1268 M9): pure money math for share-only payout reversals. No I/O, so
 * the refund path, the payout ledger and Money's earnings all use one rule.
 */

/** The part of one leg that belongs to the refunded charge (integer minor units). */
export function shareOfLegCents(legCents: number, refundedChargeCents: number, otherLiveChargeCents: number): number {
  const leg = Math.max(0, Math.round(legCents));
  if (otherLiveChargeCents <= 0) return leg;
  const total = refundedChargeCents + otherLiveChargeCents;
  if (total <= 0 || refundedChargeCents <= 0) return 0;
  return Math.min(leg, Math.round((leg * refundedChargeCents) / total));
}

/**
 * Reversals on a Stripe transfer that the ledger amount does NOT already reflect.
 *
 * A share-only reversal lowers `booking_payouts.amount_cents` to what is still
 * paid out, so `amount_cents` is "transferred minus share reversals". Stripe's
 * `amount_reversed` counts every reversal. The difference between the transfer's
 * original amount and the ledger amount is the part already recorded; only the
 * rest may still be subtracted. Without the transfer amount (list failed), the
 * whole `amount_reversed` is treated as unrecorded (the pre-E5 behaviour).
 */
export function unrecordedReversedCents(
  amountReversedCents: number,
  transferAmountCents: number | null | undefined,
  legAmountCents: number,
): number {
  const reversed = Math.max(0, amountReversedCents);
  if (typeof transferAmountCents !== "number") return reversed;
  const recorded = Math.max(0, transferAmountCents - legAmountCents);
  return Math.max(0, reversed - recorded);
}
