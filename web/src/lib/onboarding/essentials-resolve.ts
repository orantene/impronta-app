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
 * TUL-77: the zone hours are written in. Confirmed zone first, then the city
 * (+ country) the person typed, then the country default. Null only when
 * nothing is known; hours are never written in a guessed UTC.
 */
export function resolveEssentialsTimezone(input: {
  timezone: string | null | undefined;
  city: string | null | undefined;
  country: string | null | undefined;
}): string | null {
  const own = input.timezone?.trim();
  if (own && isValidIanaTimeZone(own)) return own;
  const place = [input.city, input.country].map((x) => x?.trim()).filter(Boolean).join(", ");
  const fromPlace = place ? timezoneFromPlaceText(place) : null;
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
    timezone: resolveEssentialsTimezone({ timezone: e?.timezone, city: input.city, country: input.country }),
    place: e?.place ?? null,
    firstProviderEmail: e?.firstProviderEmail ?? null,
    firstProviderName: e?.firstProviderName ?? null,
    confirmed: e?.confirmed ?? false,
    source: e?.source ?? (input.serviceFacts.length ? "ai" : "pack"),
  };
}
