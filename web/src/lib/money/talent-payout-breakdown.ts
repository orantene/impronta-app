/**
 * Talent payout breakdown + arrival (TUL-1061). Pure, client-safe.
 *
 *   gross - Tulala commission - other deductions = net payout
 *
 * `other deductions` is whatever else comes off the talent's price (a
 * workspace's commission, or the card fee when the talent absorbs it). It is
 * derived so the three lines always add up to the net, to the cent. Tulala's
 * +1.5% service fee is paid by the CLIENT on top and is never a deduction here.
 *
 * Arrival uses only documented figures (fee-config PAYOUT_ARRIVAL): MX
 * platform payouts 3 business days, US 2, recipient accounts +24 hours before
 * funds are available.
 */

import { PAYOUT_ARRIVAL, payoutPlatformForCurrency, type PayoutPlatform } from "@/lib/billing/fee-config";

export type TalentPayoutBreakdown = {
  grossCents: number;
  tulalaCommissionCents: number;
  otherDeductionsCents: number;
  netCents: number;
};

/** Null when the figures cannot add up (net above gross): show nothing rather than guess. */
export function talentPayoutBreakdown(input: {
  grossCents: number;
  netCents: number;
  /** Tulala's commission taken from the talent. 0 under the client-pays-fee model. */
  tulalaCommissionCents?: number;
}): TalentPayoutBreakdown | null {
  const { grossCents, netCents } = input;
  const tulala = input.tulalaCommissionCents ?? 0;
  if (![grossCents, netCents, tulala].every((n) => Number.isInteger(n) && n >= 0)) return null;
  const other = grossCents - tulala - netCents;
  if (other < 0) return null;
  return { grossCents, tulalaCommissionCents: tulala, otherDeductionsCents: other, netCents };
}

export type PayoutArrival = {
  platform: PayoutPlatform;
  businessDays: number;
  /** Extra hours before funds are available, recipient accounts only. */
  recipientExtraHours: number | null;
};

export function payoutArrival(input: { currency: string; recipientAccount?: boolean }): PayoutArrival {
  const platform = payoutPlatformForCurrency(input.currency);
  return {
    platform,
    businessDays: PAYOUT_ARRIVAL.businessDays[platform],
    recipientExtraHours: input.recipientAccount ? PAYOUT_ARRIVAL.recipientExtraHours : null,
  };
}
