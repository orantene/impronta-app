/**
 * What is still owed on ONE booking, read from the booking's payment ledger
 * (`booking_transactions`). Pure: no I/O. Uses the same "money in" rule the
 * staff side uses (`sumMoneyIn`: paid, payout_pending, payout_sent; refunded
 * and cancelled rows never count), so the client never sees a different number
 * from the workspace. Policy (deposit rules, fees) is never recomputed here.
 */

import { sumMoneyIn } from "@/lib/bookings/manual-payment";

export type LedgerPaidRow = {
  grossCents: number;
  status: string;
  currency: string | null;
  refundOfTransactionId?: string | null;
};

/**
 * Remainder in cents, or `null` when the ledger cannot give a trustworthy
 * number (no usable total, a money-in row in another currency, or any refund
 * row that would need netting). Callers show NOTHING for null, never a guess.
 */
export function balanceDueCents(
  totalCents: number | null | undefined,
  rows: readonly LedgerPaidRow[],
  currency?: string | null,
): number | null {
  if (typeof totalCents !== "number" || !Number.isFinite(totalCents) || totalCents <= 0) return null;
  if (rows.some((r) => r.refundOfTransactionId)) return null;
  const cur = currency?.trim().toUpperCase() || null;
  const moneyIn = rows.filter((r) => sumMoneyIn([{ id: "", grossCents: r.grossCents, status: r.status, providerReference: null }]) > 0);
  if (cur && moneyIn.some((r) => (r.currency?.trim().toUpperCase() || cur) !== cur)) return null;
  const paid = sumMoneyIn(rows.map((r) => ({ id: "", grossCents: r.grossCents, status: r.status, providerReference: null })));
  return Math.max(0, Math.round(totalCents) - paid);
}
