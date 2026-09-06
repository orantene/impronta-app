/**
 * Labels for a public event page, in the VENUE'S zone, with the zone named.
 *
 * A wall clock is not an instant: `sessions.starts_at` is the instant, the
 * venue's zone is how a guest reads it. Naming the zone in the label means a
 * wrong zone is visible on the page instead of hiding behind a plausible time —
 * "Tuesday 8 at 12:00 AM" for a Monday 9 PM show in Buenos Aires looked
 * entirely normal in UTC.
 */

import { pickTimezone } from "@/lib/spaces/venue-timezone";

export type EventLabelLocale = "en" | "es";

/**
 * The zone a PUBLIC page may format a night in, or null. The venue's zone,
 * else the workspace's; NEVER the platform's "UTC" last rung. Reservations'
 * island already refuses without a zone; the events pages showed a date
 * anyway. A missing zone must not produce a date.
 */
export function resolvePublicZone(candidates: { venue: string | null; workspace: string | null }): string | null {
  const picked = pickTimezone(candidates);
  return picked.source === "platform" ? null : picked.timezone;
}

function unknownTime(locale: EventLabelLocale): string {
  return locale === "es" ? "Horario a confirmar por el local" : "Time to be confirmed by the venue";
}

export function whenLabel(
  iso: string | null,
  timeZone: string | null,
  locale: EventLabelLocale = "en",
  withTime = true,
): string {
  const tba = locale === "es" ? "Fecha a confirmar" : "Date to be announced";
  if (!iso) return tba;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return tba;
  // No zone, no date: a day boundary is a zone fact too.
  if (!timeZone) return unknownTime(locale);
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

export function timeLabel(iso: string, timeZone: string | null, locale: EventLabelLocale = "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (!timeZone) return unknownTime(locale);
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
