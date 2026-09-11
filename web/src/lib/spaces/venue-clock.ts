/**
 * The venue's clock — the ONE formatter for any instant a person reads on a
 * restaurant surface (the floor, the kitchen board, the host stand).
 *
 * WHY THIS FILE EXISTS. `new Intl.DateTimeFormat(locale, { hour, minute })`
 * with no `timeZone` formats in whatever zone the RUNTIME is set to. On a
 * server-rendered dynamic page that is two different runtimes for one string:
 * the Node process that produced the markup (UTC on Vercel) and the browser
 * that hydrates it (the device's zone, which for a host on holiday is not the
 * restaurant's either). The same instant then renders 02:00 in the HTML and
 * 20:00 a tick later, and neither number is the one the venue runs on.
 *
 * A HOST READS THE VENUE'S CLOCK. Not the server's, not the phone's. So the
 * zone is a required argument here and there is no overload without it: the
 * only way to format a time on these screens is to say which zone it is in.
 *
 * PURE, AND NO CLOCK READ. Every function takes the instant it formats. There
 * is no `Date.now()` in this file, which is what makes it safe to call during
 * a React render (`react-hooks/purity`) and what makes the output identical on
 * the server and in the browser.
 *
 * 24-HOUR, EVERY LOCALE, VIA `hourCycle` AND NOT `hour12`. "8" on a service
 * board is ambiguous, so the host stand settled on 24-hour before the floor
 * existed — but it asked for it with `hour12: false`, and in this ICU build
 * that is the `h24` cycle in English: midnight renders as **24:10**, while the
 * same call in Spanish and French renders 00:10. One screen, three languages,
 * two different midnights. `hourCycle: "h23"` names the cycle we actually mean
 * and is the same in all three. (Passing both is not a belt and braces: the
 * spec lets `hour12` override `hourCycle`, so `hour12` must not be passed.)
 */

import { isValidIanaTimeZone } from "@/lib/scheduling/tz";

/**
 * Shown instead of a time we cannot state. Deliberately not an empty string
 * and not "now": a missing time must look missing.
 */
export const VENUE_TIME_UNKNOWN = "--:--";

/**
 * The zone actually used to format. An unusable zone falls back to UTC and
 * SAYS UTC, rather than silently borrowing the runtime's own zone — which is
 * the failure this module exists to remove.
 */
function safeZone(timeZone: string): string {
  return isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
}

/** An instant as the venue's own wall clock, HH:MM, 24-hour. */
export function venueHhmm(iso: string, timeZone: string, locale: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return VENUE_TIME_UNKNOWN;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: safeZone(timeZone),
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(at);
  } catch {
    return VENUE_TIME_UNKNOWN;
  }
}

/**
 * How the venue's zone is named to a human: the IANA id plus the offset in
 * force at `at`, e.g. `America/Mexico_City (GMT-6)`.
 *
 * `at` is a parameter and not `new Date()` because the offset moves with DST
 * and because a clock read belongs to the caller, never to a formatter that
 * may run inside a render.
 */
export function venueZoneLabel(timeZone: string, locale: string, at: Date): string {
  const zone = safeZone(timeZone);
  if (Number.isNaN(at.getTime())) return zone;
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value;
    return offset ? `${zone} (${offset})` : zone;
  } catch {
    return zone;
  }
}
