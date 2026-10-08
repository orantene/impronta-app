/**
 * TUL-154 — fee-netted transactions must never carry `order_id`.
 *
 * `order_collected_cents` / `completeOrderForTransaction` credit
 * `net_amount_cents` as service principal when net ≤ gross. Fee-netted rows
 * (commission deducted into `platform_fee_cents`) store net = gross − commission,
 * so an order_id would under-count collection. Pass-through and net=gross writers
 * keep `platform_fee_basis_points = 0`.
 *
 * Discriminator is `platform_fee_basis_points > 0`, matching the DB CHECK
 * `booking_transactions_fee_netted_no_order`. Fee-netted writers MUST snapshot
 * bps via `feeNettedBasisPoints` so a 1¢ commission on a large gross cannot
 * round to 0 and look like pass-through.
 */

export type FeeNettedOrderIdShape = {
  orderId: string | null | undefined;
  platformFeeBasisPoints: number;
};

/**
 * Snapshot basis points for a fee-netted (commission-from-gross) amount.
 * A positive fee always yields bps ≥ 1 — never rounds into the pass-through
 * lane (`bps = 0` with `fee_cents > 0`).
 */
export function feeNettedBasisPoints(feeCents: number, grossCents: number): number {
  if (!Number.isFinite(feeCents) || !Number.isFinite(grossCents)) return 0;
  if (feeCents <= 0 || grossCents <= 0) return 0;
  return Math.max(1, Math.round((feeCents / grossCents) * 10_000));
}

/** True when fee/net imply a deducted commission but bps was rounded to 0. */
export function isFeeNettedBpsInconsistent(row: {
  platformFeeCents: number;
  platformFeeBasisPoints: number;
}): boolean {
  const fee = Number(row.platformFeeCents);
  const bps = Number(row.platformFeeBasisPoints);
  if (!Number.isFinite(fee) || !Number.isFinite(bps)) return false;
  return fee > 0 && bps <= 0;
}

/** True when the row would violate TUL-154 (fee-netted + order_id). */
export function isFeeNettedOrderIdViolation(row: FeeNettedOrderIdShape): boolean {
  const bps = Number(row.platformFeeBasisPoints);
  if (!Number.isFinite(bps) || bps <= 0) return false;
  const orderId = typeof row.orderId === "string" ? row.orderId.trim() : "";
  return orderId.length > 0;
}

/**
 * Refuse a fee-netted + order_id shape before insert/update.
 * Returns null when allowed; an error message when blocked.
 */
export function guardFeeNettedOrderId(row: FeeNettedOrderIdShape): string | null {
  if (!isFeeNettedOrderIdViolation(row)) return null;
  return "Fee-netted transactions cannot carry order_id (would under-count order collection).";
}
