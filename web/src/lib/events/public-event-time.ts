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

/**
 * IANA zone → the city a guest would say. The last segment of the zone id,
 * underscores to spaces, with the accents the id cannot carry restored for
 * the cities this platform actually sells in. "America/Cancun" → "Cancún",
 * "America/Argentina/Buenos_Aires" → "Buenos Aires".
 */
const ZONE_CITY: Record<string, { en: string; es: string }> = {
  Cancun: { en: "Cancún", es: "Cancún" },
  Mexico_City: { en: "Mexico City", es: "Ciudad de México" },
  Merida: { en: "Mérida", es: "Mérida" },
  Bogota: { en: "Bogotá", es: "Bogotá" },
  Sao_Paulo: { en: "São Paulo", es: "São Paulo" },
  Asuncion: { en: "Asunción", es: "Asunción" },
  Panama: { en: "Panama City", es: "Panamá" },
  Lima: { en: "Lima", es: "Lima" },
  New_York: { en: "New York", es: "Nueva York" },
  Los_Angeles: { en: "Los Angeles", es: "Los Ángeles" },
  Madrid: { en: "Madrid", es: "Madrid" },
  Buenos_Aires: { en: "Buenos Aires", es: "Buenos Aires" },
};

export function zoneCity(timeZone: string, locale: EventLabelLocale = "en"): string {
  const last = timeZone.split("/").at(-1) ?? timeZone;
  const known = ZONE_CITY[last];
  if (known) return known[locale];
  return last.replace(/_/g, " ");
}

/**
 * The night as a ticket names it, with the zone as a CITY rather than an
 * abbreviation: "sábado 3 de octubre, 18:00 h (hora de Cancún)" /
 * "Saturday, October 3, 6:00 PM (Cancún time)". "EST" on a Cancún ticket was
 * both wrong (Cancún has no DST) and unreadable to the guest holding it;
 * the city is what they would type into a map.
 *
 * Same refusals as `whenLabel`: no instant → "to be announced"; no zone →
 * "to be confirmed by the venue", never the server's clock.
 */
export function nightLabelWithCity(
  iso: string | null,
  timeZone: string | null,
  locale: EventLabelLocale = "en",
): string {
  const tba = locale === "es" ? "Fecha a confirmar" : "Date to be announced";
  if (!iso) return tba;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return tba;
  if (!timeZone) return unknownTime(locale);
  try {
    const parts = new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: locale !== "es",
    }).formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    const weekday = get("weekday");
    const day = get("day");
    const month = get("month");
    // `hour: "numeric"` in es gives "18"; in en gives "6" + dayPeriod "PM".
    const hour = get("hour").padStart(locale === "es" ? 2 : 1, "0");
    const minute = get("minute");
    const city = zoneCity(timeZone, locale);
    if (locale === "es") {
      return `${weekday} ${day} de ${month}, ${hour}:${minute} h (hora de ${city})`;
    }
    const period = get("dayPeriod").toUpperCase();
    return `${weekday}, ${month} ${day}, ${hour}:${minute} ${period} (${city} time)`;
  } catch {
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
