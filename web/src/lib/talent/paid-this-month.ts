import type { TalentEarnings } from "@/lib/talent/earnings-types";

export type PaidThisMonth = { totalCents: number; count: number; currency: string };

/**
 * "Paid this month" for the talent Today hero — derived from REAL earnings
 * rows (status='paid' with a payoutDate in the current calendar month),
 * matching the Money page's data source. Returns 0 when there are no real
 * paid bookings, so a talent with no history sees an honest €0 instead of the
 * old hard-coded demo fixture.
 *
 * `now` is injectable for testing (default: current date).
 */
export function computePaidThisMonth(
  earnings: TalentEarnings,
  now: Date = new Date(),
): PaidThisMonth {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let totalCents = 0;
  let count = 0;
  for (const row of earnings.rows) {
    if (row.status !== "paid" || !row.payoutDate) continue;
    const d = new Date(row.payoutDate);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getUTCFullYear() === y && d.getUTCMonth() === m) {
      totalCents += row.netCents;
      count += 1;
    }
  }
  return { totalCents, count, currency: earnings.totals.currency || "EUR" };
}
