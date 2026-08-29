/**
 * Day-of reminder window. Prefer agency_bookings.starts_at when present.
 * UTC civil date of the instant; event_date is the fallback for M0 rows.
 */

export function bookingIsRemindableTomorrow(
  row: { starts_at?: string | null; event_date?: string | null },
  tomorrowYmd: string,
  dayAfterYmd: string,
): boolean {
  if (typeof row.starts_at === "string" && row.starts_at.trim()) {
    return row.starts_at.slice(0, 10) === tomorrowYmd;
  }
  if (typeof row.event_date === "string" && row.event_date.trim()) {
    return row.event_date >= tomorrowYmd && row.event_date < dayAfterYmd;
  }
  return false;
}
