/**
 * TUL-84: what the build writes. The person's confirmed essentials win;
 * otherwise the AI-read (stated by the person) services (kept, never dropped) fill in with pack
 * durations/prices; the Mon-Sat 9-19 hours and the country timezone are the
 * defaults. Null when there is nothing to write (no services at all).
 */

import {
  defaultTimezoneForCountry,
  defaultWeeklyHours,
  hoursHaveAnyOpenDay,
  servicesFromFacts,
  type Essentials,
} from "./essentials";
import { timezoneFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import { isValidIanaTimeZone } from "@/lib/scheduling/tz";

/**
 * TUL-77 / TUL-540: the zone hours are written in. A person-confirmed zone
 * wins; a soft pack default (Mexico_City with no picker confirm) yields to
 * the city. Then city (+ country), then the country default. Null only when
 * nothing is known; hours are never written in a guessed UTC.
 */
export function resolveEssentialsTimezone(input: {
  timezone: string | null | undefined;
  city: string | null | undefined;
  country: string | null | undefined;
  /**
   * When true, `timezone` is treated as a soft pack default: a city-derived
   * zone (e.g. Cancún → America/Cancun) may override America/Mexico_City.
   */
  softTimezone?: boolean;
}): string | null {
  const place = [input.city, input.country].map((x) => x?.trim()).filter(Boolean).join(", ");
  const fromPlace = place ? timezoneFromPlaceText(place) : null;
  const own = input.timezone?.trim();
  if (own && isValidIanaTimeZone(own)) {
    if (
      input.softTimezone &&
      own === "America/Mexico_City" &&
      fromPlace &&
      isValidIanaTimeZone(fromPlace) &&
      fromPlace !== own
    ) {
      return fromPlace;
    }
    return own;
  }
  if (fromPlace && isValidIanaTimeZone(fromPlace)) return fromPlace;
  return defaultTimezoneForCountry(input.country);
}

export function resolveEssentialsForBuild(input: {
  essentials: Essentials | null;
  serviceFacts: string[];
  discipline: string | null;
  tradeSlug: string | null;
  country: string | null;
  /** The city from the brief (`person.city`); feeds the timezone. */
  city?: string | null;
  locale: "en" | "es";
}): Essentials | null {
  const ctx = { trade: input.tradeSlug, discipline: input.discipline, country: input.country, locale: input.locale };
  const e = input.essentials;
  const services = e?.services.length
    ? e.services
    : servicesFromFacts(input.serviceFacts, ctx);
  if (!services.length) return null;
  return {
    name: e?.name ?? null,
    services,
    hours: hoursHaveAnyOpenDay(e?.hours ?? null) ? e!.hours : defaultWeeklyHours(),
    timezone: resolveEssentialsTimezone({
      timezone: e?.timezone,
      city: input.city,
      country: input.country,
      // Unconfirmed pack prefill must not lock Mexico_City over Cancún (onb1-04).
      softTimezone: !e?.confirmed,
    }),
    place: e?.place ?? null,
    firstProviderEmail: e?.firstProviderEmail ?? null,
    firstProviderName: e?.firstProviderName ?? null,
    ownerProvides: e?.ownerProvides ?? true,
    confirmed: e?.confirmed ?? false,
    source: e?.source ?? (input.serviceFacts.length ? "ai" : "pack"),
  };
}

/**
 * The build writes services and hours only when it has services. When it has
 * none (the "too little" path: the AI read found nothing and the trade has no
 * pack) the page goes live with an empty catalog, so say so in the build
 * warnings instead of staying silent.
 */
export function essentialsSkipWarning(essentials: Essentials | null | undefined): string | null {
  return essentials && essentials.services.length ? null : "essentials:no_services";
}
