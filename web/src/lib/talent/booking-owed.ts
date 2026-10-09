/**
 * TUL-429 (Money page): what a client still owes on ONE booking, and whether a
 * payment row is a part payment. Pure.
 *
 * A refunded, void or waived booking owes NOTHING. The old chain in
 * clients-actions.ts only knew `paid`, so a refunded sale fell through to "owed =
 * the whole price" and the Money page counted a returned payment as money
 * still to come ("Te deben $2,000" over one $1,000 sale).
 */

/** Payment states in which nothing is owed any more (settled, returned, or written off). */
const NOT_OWED = new Set([
  "paid",
  "refunded",
  "refund_pending",
  "void",
  "voided",
  "cancelled",
  "canceled",
  "waived",
  "written_off",
]);

export function bookingOwedCents(input: {
  paymentStatus: string | null | undefined;
  /** The booking's price in cents (the talent leg's charge, else the booking total). */
  basisCents: number;
  /** The configured deposit in cents (only used when the ledger has no paid money). */
  depositCents: number;
  /** What the ledger actually collected on this booking. */
  ledgerPaidCents: number;
}): number | null {
  const ps = (input.paymentStatus ?? "").trim().toLowerCase();
  if (NOT_OWED.has(ps)) return 0;
  if (input.ledgerPaidCents > 0) return Math.max(0, input.basisCents - input.ledgerPaidCents);
  if (ps === "partial") return Math.max(0, input.basisCents - input.depositCents);
  return input.basisCents > 0 ? input.basisCents : null;
}

/**
 * A payment row is a PART payment only when the facts say so: the booking's own
 * payment status is partial, or the ledger collected less than the price. The
 * earnings `status` ("pending") also covers a fully paid sale that is waiting
 * for its payout, so it must not decide this.
 */
export function isPartPaidRow(row: {
  paymentStatus?: string | null;
  collectedCents?: number | null;
  grossCents: number;
}): boolean {
  const ps = (row.paymentStatus ?? "").trim().toLowerCase();
  if (ps === "partial" || ps === "partially_paid" || ps === "deposit_paid") return true;
  if (NOT_OWED.has(ps)) return false;
  const collected = row.collectedCents ?? 0;
  return collected > 0 && collected < row.grossCents;
}
