/**
 * TUL-1176: the fee RATE a person reads on a transaction.
 *
 * `booking_transactions.platform_fee_basis_points` is a stored snapshot field, and on
 * pass-through / fee-netted rows it is 0 although a real fee (about 148 bps) was charged
 * (see the comment on `platformFeeBasisPoints` in transactions.ts). Printing it as a rate
 * told the owner "0%" next to a non-zero fee. For DISPLAY the rate is derived from what was
 * actually charged: platform fee cents over gross cents.
 *
 * DISPLAY ONLY. Nothing here is read by a charge, commission, payout or refund path; it only
 * formats a label from two numbers already on screen. Pure.
 */
import { feePercent } from "@/lib/bookings/commission";

/**
 * Effective fee rate label, e.g. 148 bps of charge shows "1.5%".
 * Falls back to the stored basis points only when there is no usable gross (nothing charged to
 * derive a rate from).
 */
export function effectiveFeeLabel(input: {
  platformFeeCents: number;
  grossAmountCents: number;
  storedBasisPoints: number;
}): string {
  const fee = Number(input.platformFeeCents);
  const gross = Number(input.grossAmountCents);
  if (Number.isFinite(fee) && Number.isFinite(gross) && gross > 0 && fee >= 0) {
    return feePercent(Math.round((fee / gross) * 10_000));
  }
  const stored = Number(input.storedBasisPoints);
  return feePercent(Number.isFinite(stored) && stored >= 0 ? stored : 0);
}
