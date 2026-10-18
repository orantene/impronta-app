/**
 * TUL-1176: the fee RATE a person reads on a booking.
 *
 * `booking_transactions.platform_fee_basis_points` is a stored snapshot field that is 0 on
 * pass-through / fee-netted rows BY DESIGN (see the comment on `platformFeeBasisPoints` in
 * transactions.ts); no backfill. Printing it as a rate told the owner "0%" next to a real fee.
 *
 * Rule (PM, 2026-10-18):
 *  1. A commission snapshot exists -> keep showing the snapshot rate (the source of truth for
 *     the real split): platform fee / gross charged, whole percent, exactly as before.
 *  2. No snapshot -> derive the rate from what was actually charged on the transaction:
 *     platformFeeCents / grossAmountCents (e.g. 148 bps shows "1.5%"). The stored bps is used
 *     only when there is no gross to derive from.
 *
 * DISPLAY ONLY. Nothing here is read by a charge, commission, payout or refund path; it only
 * formats a label from numbers already on screen. Pure.
 */
import { feePercent } from "@/lib/bookings/commission";

export function effectiveFeeLabel(input: {
  platformFeeCents: number;
  grossAmountCents: number;
  storedBasisPoints: number;
  /** Totals across the booking's commission snapshots, when any exist. Wins over everything else. */
  snapshot?: { platformFeeCents: number; grossChargedCents: number } | null;
}): string {
  if (input.snapshot) {
    const gross = Number(input.snapshot.grossChargedCents);
    const fee = Number(input.snapshot.platformFeeCents);
    return Number.isFinite(gross) && Number.isFinite(fee) && gross > 0 ? `${Math.round((fee / gross) * 100)}%` : "0%";
  }
  const fee = Number(input.platformFeeCents);
  const gross = Number(input.grossAmountCents);
  if (Number.isFinite(fee) && Number.isFinite(gross) && gross > 0 && fee >= 0) {
    return feePercent(Math.round((fee / gross) * 10_000));
  }
  const stored = Number(input.storedBasisPoints);
  return feePercent(Number.isFinite(stored) && stored >= 0 ? stored : 0);
}
