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

export function resolveEssentialsForBuild(input: {
  essentials: Essentials | null;
  serviceFacts: string[];
  discipline: string | null;
  tradeSlug: string | null;
  country: string | null;
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
    timezone: e?.timezone ?? defaultTimezoneForCountry(input.country),
    place: e?.place ?? null,
    firstProviderEmail: e?.firstProviderEmail ?? null,
    firstProviderName: e?.firstProviderName ?? null,
    confirmed: e?.confirmed ?? false,
    source: e?.source ?? (input.serviceFacts.length ? "ai" : "pack"),
  };
}
