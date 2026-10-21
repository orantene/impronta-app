/**
 * TUL-1611 · Refunds and lost disputes on an automatic rent charge (pure). The charge is a destination charge: the
 * studio received a transfer (its rent share). When money goes back to the member (a refund) or is taken by the bank
 * (a LOST dispute), the studio's share of that money is reversed from its transfer, proportionally, like the booking
 * payouts are (published Refunds policy). Computed from CUMULATIVE totals so partial refunds, replays and a refund
 * plus a dispute on the same charge never reverse twice.
 */
export function rentReversalCents(input: {
  /** The charge amount (rent + fee). */
  chargeCents: number;
  /** What the studio was transferred for this charge. */
  transferCents: number;
  /** Already reversed from that transfer (by us or anyone). */
  alreadyReversedCents: number;
  /** Total refunded on the charge so far. */
  refundedCents: number;
  /** Amount of a LOST dispute on the charge (0 when none or not lost). */
  lostDisputeCents: number;
}): number {
  const { chargeCents, transferCents, alreadyReversedCents } = input;
  if (![chargeCents, transferCents, alreadyReversedCents, input.refundedCents, input.lostDisputeCents].every((n) => Number.isInteger(n) && n >= 0)) return 0;
  if (chargeCents === 0 || transferCents === 0) return 0;
  const gone = Math.min(chargeCents, input.refundedCents + input.lostDisputeCents);
  // The studio's share of the money that went back, rounded DOWN (never reverse more than its share).
  const target = Math.min(transferCents, Math.floor((transferCents * gone) / chargeCents));
  return Math.max(0, target - alreadyReversedCents);
}
