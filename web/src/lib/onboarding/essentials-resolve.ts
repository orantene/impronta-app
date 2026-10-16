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
  isMexico,
  servicesFromFacts,
  type Essentials,
} from "./essentials";
import { timezoneFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import { timezoneFromCountry } from "@/lib/scheduling/country-timezone";
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
  /** Spanish flow with no country at all defaults to Mexico City. */
  locale?: "en" | "es";
  /** TUL-540: `timezone` is a soft pack default; a city-derived zone (Cancún) may override Mexico_City. */
  softTimezone?: boolean;
}): string | null {
  const own = input.timezone?.trim();
  const place = [input.city, input.country].map((x) => x?.trim()).filter(Boolean).join(", ");
  const fromPlace = place ? timezoneFromPlaceText(place) : null;
  if (own && isValidIanaTimeZone(own)) {
    if (input.softTimezone && own === "America/Mexico_City" && fromPlace && isValidIanaTimeZone(fromPlace) && fromPlace !== own) {
      return fromPlace;
    }
    return own;
  }
  if (fromPlace && isValidIanaTimeZone(fromPlace)) return fromPlace;
  const fromCountry = defaultTimezoneForCountry(input.country) ?? timezoneFromCountry(input.country);
  if (fromCountry) return fromCountry;
  return !input.country?.trim() && input.locale === "es" ? "America/Mexico_City" : null;
}

/**
 * Step 3's country: what the person said, else Mexico when the request comes
 * from there (Vercel geo, ISO-2). Only Mexico is inferred: it is the one
 * country whose zone and currency are set without asking, so a Tulum studio
 * whose sentence named no country must not get USD and a zone list without Mexico.
 */
export function setupCountry(
  stated: string | null | undefined,
  requestCountry: string | null | undefined,
): string | null {
  const said = stated?.trim();
  if (said) return said;
  return isMexico(requestCountry) ? "MX" : null;
}

/** Step 3 never asks a Mexican business its zone, so take it from the city (Tulum -> America/Cancun). Null outside Mexico. */
export function setupTimezone(city: string | null | undefined, country: string | null | undefined): string | null {
  return isMexico(country) ? resolveEssentialsTimezone({ timezone: null, city, country }) : null;
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
    timezone: resolveEssentialsTimezone({ timezone: e?.timezone, city: input.city, country: input.country, locale: input.locale, softTimezone: !e?.confirmed }),
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
