/**
 * Labels for a public event page, in the VENUE'S zone, with the zone named.
 *
 * A wall clock is not an instant: `sessions.starts_at` is the instant, the
 * venue's zone is how a guest reads it. Naming the zone in the label means a
 * wrong zone is visible on the page instead of hiding behind a plausible time —
 * "Tuesday 8 at 12:00 AM" for a Monday 9 PM show in Buenos Aires looked
 * entirely normal in UTC.
 */

export type EventLabelLocale = "en" | "es";

export function whenLabel(
  iso: string | null,
  timeZone: string,
  locale: EventLabelLocale = "en",
  withTime = true,
): string {
  const tba = locale === "es" ? "Fecha a confirmar" : "Date to be announced";
  if (!iso) return tba;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return tba;
  try {
    return d.toLocaleString(locale === "es" ? "es" : "en", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: locale !== "es", timeZoneName: "short" } : {}),
    });
  } catch {
    // Never silently the reader's zone.
    return d.toISOString();
  }
}

export function timeLabel(iso: string, timeZone: string, locale: EventLabelLocale = "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleTimeString(locale === "es" ? "es" : "en", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: locale !== "es",
      timeZoneName: "short",
    });
  } catch {
    return d.toISOString();
  }
}
