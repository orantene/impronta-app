/**
 * period-date.ts (QA P3, 2026-10-21) · one way to print a Stripe period end.
 *
 * Stripe stores `current_period_end` as a UTC instant. The app used to format it
 * with the viewer's browser zone (and the server render with UTC), so a renewal
 * at 02:00 UTC read as the previous day in Cancun while the Stripe portal showed
 * the next one: a one-day drift. Every billing date now prints as its UTC
 * calendar day, in the viewer's language, on server and client alike.
 */
export function formatPeriodDate(
  iso: string | number | Date | null | undefined,
  locale: string | null | undefined,
): string | null {
  if (iso === null || iso === undefined || iso === "") return null;
  const d = iso instanceof Date ? iso : new Date(typeof iso === "number" ? iso * 1000 : iso);
  if (Number.isNaN(d.getTime())) return null;
  const tag = locale === "es" ? "es-MX" : "en-US";
  return new Intl.DateTimeFormat(tag, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d);
}
