/**
 * A SOLO talent has no agency membership: not on any agency roster (active or
 * pending) and no application in flight. Agency surfaces (the agencies page,
 * Discover agencies, the "apply to hubs" entry points) stay hidden for them, so
 * a solo talent is never shown a concept that is not theirs. A talent with an
 * application in flight keeps the page, because that is where they withdraw it.
 */
export function isSoloTalent(input: { rosterAgencyCount: number; applicationCount: number }): boolean {
  return input.rosterAgencyCount <= 0 && input.applicationCount <= 0;
}

/** Where a solo talent who lands on an agency-only route is sent instead. */
export const SOLO_TALENT_AGENCY_FALLBACK = "/talent/today";
