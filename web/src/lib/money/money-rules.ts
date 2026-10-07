/**
 * TUL-35: the ONE rule set behind every talent Money total (Collected, Owed,
 * Cash split, Requests waiting). Pure, no I/O, imported by the loaders and the
 * page so the totals cannot drift apart.
 *
 *   - Live work only: cancelled, voided, declined, expired, no-show and
 *     refunded bookings are never owed and never "waiting".
 *   - Paid = money-in ledger rows (webhook-confirmed card, or recorded cash /
 *     transfer). See MONEY_IN_STATUSES in bookings/manual-payment.ts.
 *   - Month = the talent's calendar month (their timezone), not the server's.
 *   - Currency = the talent currency; other currencies are reported apart and
 *     never summed.
 */

/** Booking statuses that can never owe money or wait on a payment request. */
const DEAD_BOOKING_STATUSES: ReadonlySet<string> = new Set([
  "cancelled",
  "canceled",
  "void",
  "voided",
  "declined",
  "rejected",
  "expired",
  "hold_expired",
  "no_show",
  "no-show",
  "refunded",
]);

/** True when the raw booking status means the work is off (no money is due). */
export function isDeadBookingStatus(status: string | null | undefined): boolean {
  return DEAD_BOOKING_STATUSES.has((status ?? "").trim().toLowerCase());
}

/** "YYYY-MM" of `now` in `timeZone` (falls back to UTC when the zone is invalid). */
export function monthKeyInZone(now: Date, timeZone?: string | null): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit" }).formatToParts(now);
  }
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

/**
 * "October 2026" in English, "octubre 2026" in Spanish (lower-case month, no
 * "de", never title-cased). Built from parts so the result does not depend on
 * the runtime's locale pattern.
 */
export function formatMonthLabel(key: string, locale: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1, 12));
  const month = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(d);
  const isEs = locale.toLowerCase().startsWith("es");
  return `${isEs ? month.toLocaleLowerCase(locale) : month} ${y}`;
}
