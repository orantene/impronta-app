/**
 * TUL-154 — fee-netted transactions must never carry `order_id`.
 *
 * `order_collected_cents` / `completeOrderForTransaction` credit
 * `net_amount_cents` as service principal when net ≤ gross. Fee-netted rows
 * (commission deducted into `platform_fee_cents`, snapshotted as
 * `platform_fee_basis_points > 0`) store net = gross − commission, so an
 * order_id would under-count collection. Pass-through and net=gross writers
 * keep `platform_fee_basis_points = 0`.
 *
 * Pure predicate mirroring the DB CHECK
 * `booking_transactions_fee_netted_no_order`.
 */

export type FeeNettedOrderIdShape = {
  orderId: string | null | undefined;
  platformFeeBasisPoints: number;
};

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
