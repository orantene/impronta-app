/**
 * E5 review fix (2): the talent net Money shows after a share-only payout reversal.
 *
 * A full refund of ONE charge on a booking whose other charges are still paid
 * (deposit refunded, balance paid) reverses only that charge's share of each
 * payout leg (`payments/refund-charge-share.ts`) and leaves the booking live. The
 * commission snapshot still holds the full talent net, so Money must take the
 * same share off: net minus `shareOfLegCents(net, refunded, still paid)`, the
 * exact formula the reversal used, so earnings equal transferred minus reversed.
 * Pure.
 */
import type { LedgerPaid } from "@/lib/bookings/ledger-paid";
import { shareOfLegCents } from "@/lib/payments/charge-share-math";

export function talentNetAfterRefundedCharges(talentNetCents: number, ledger: LedgerPaid | null): number {
  const refunded = ledger?.refundedChargeCents ?? 0;
  const stillPaid = ledger?.paidCents ?? 0;
  // Nothing refunded, or nothing left paid (a fully refunded booking is dropped from Money upstream).
  if (!(refunded > 0) || !(stillPaid > 0)) return talentNetCents;
  return talentNetCents - shareOfLegCents(talentNetCents, refunded, stillPaid);
}
