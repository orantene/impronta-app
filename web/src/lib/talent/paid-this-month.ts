import type { TalentEarnings } from "@/lib/talent/earnings-types";
import { collectedForMonth, currentCollectedMonth } from "@/lib/talent/collected-month";

export type PaidThisMonth = { totalCents: number; count: number; currency: string };

/**
 * "Collected this month" for the talent Today hero. Delegates to the SAME aggregate the Money
 * page uses (`collectedForMonth`), for the same month key in the talent's timezone, so Hoy and
 * Dinero always agree. (It used to sum only payout-paid rows by UTC payoutDate, which read $0
 * for cash / transfer / not-yet-paid-out work while Money showed $4,300.)
 *
 * `now` and `timeZone` are injectable for testing.
 */
export function computePaidThisMonth(
  earnings: TalentEarnings,
  now: Date = new Date(),
  timeZone?: string | null,
): PaidThisMonth {
  const c = collectedForMonth(earnings, currentCollectedMonth(now, timeZone));
  return { totalCents: c.collectedCents, count: c.collectedCount, currency: c.currency };
}
