/**
 * availability.ts — which times a party can actually be offered.
 *
 * THE ONE RULE THIS FILE ENFORCES
 * A party of four in a four-top takes ONE unit of that band's pool. Party size
 * selects WHICH band may seat you; it is never a quantity of stock. Multiplying
 * units by covers would sell one table per guest.
 *
 * UNDER-MINIMUM IS ALLOWED AND FLAGGED, NOT REFUSED
 * Seating two people at a four-top is a real thing a host does on a quiet night,
 * or because the two-tops are by the kitchen door. Spaces & Seating's
 * `decideAssignment` returns `oversized: true` rather than blocking, on the
 * grounds that a system which refuses is a system the host works around — and a
 * host working around the floor plan is how the floor plan stops matching the
 * room. But offering it to the public by default at 20:00 on a Saturday burns a
 * four-top on a deuce. So it is a policy with an honest default:
 * `allowPublicUpsize` false online, always true at the host stand.
 *
 * SMALLEST THAT FITS FIRST
 * An exact band before an upsized one, and the smallest upsize before a larger
 * one, so a party of two never takes the eight-top while a two-top is free.
 *
 * PURE. No DB. Remaining units arrive through a lookup the caller supplies,
 * which in production is `capacity_remaining_public` — called directly, never
 * through Spaces, because it already returns the tightest answer across the
 * whole ancestor chain.
 */

import type { ResolvedWindow, SeatingOption, ServiceRules } from "./types";
import { turnMinutesForParty } from "./rules";
import { seatingTimesFor } from "./windows";

/** A party-size band with a pool, as `space_groups` rows in `sell_mode='band'`. */
export type PartyBand = {
  groupId: string;
  poolId: string;
  name: string;
  partyMin: number;
  partyMax: number;
};

/** Units left on a pool over a window. `null` when the caller could not tell. */
export type RemainingLookup = (
  poolId: string,
  startsAt: Date,
  endsAt: Date,
) => number | null;

export type BandFit = {
  band: PartyBand;
  /** The party is below this band's minimum: a deuce at a four-top. */
  isUpsize: boolean;
};

export type OfferedTime = SeatingOption & {
  /** The band that would seat this party at this time. */
  band: PartyBand;
  isUpsize: boolean;
};

/**
 * Why a party is offered nothing. Named, because "we have no table that size"
 * and "we are fully booked" and "too late to book for tonight" are three
 * different sentences on the page.
 */
export type AvailabilityRefusal =
  | "reservations_off"
  | "party_below_minimum"
  | "party_above_maximum"
  | "no_band_fits_this_party"
  | "beyond_booking_horizon"
  | "inside_minimum_notice"
  | "fully_booked";

export type AvailabilityResult =
  | { ok: true; times: OfferedTime[] }
  | { ok: false; reason: AvailabilityRefusal };

/**
 * Bands that could seat this party, best first.
 *
 * A band whose `partyMax` is below the party can never seat them and is not a
 * candidate at any policy. A band whose `partyMin` is above the party is an
 * upsize, and is only a candidate when the caller allows it.
 */
export function bandsForParty(
  bands: readonly PartyBand[],
  partySize: number,
  opts: { allowUpsize: boolean },
): BandFit[] {
  const fits: BandFit[] = [];
  for (const band of bands) {
    if (partySize > band.partyMax) continue; // cannot physically seat them
    const isUpsize = partySize < band.partyMin;
    if (isUpsize && !opts.allowUpsize) continue;
    fits.push({ band, isUpsize });
  }
  // Exact before upsized; then smallest table first, so a deuce never takes the
  // eight-top while a two-top is free.
  fits.sort((a, b) => {
    if (a.isUpsize !== b.isUpsize) return a.isUpsize ? 1 : -1;
    if (a.band.partyMax !== b.band.partyMax) return a.band.partyMax - b.band.partyMax;
    return a.band.partyMin - b.band.partyMin;
  });
  return fits;
}

/**
 * The times a party may be offered in one window.
 *
 * `now` and `minNoticeMinutes` are applied to the SEATING INSTANT, not to the
 * window, so a 20:00 table is still bookable at 17:30 under a two-hour notice
 * while the 19:00 one is not.
 */
export function availabilityForWindow(input: {
  resolved: ResolvedWindow;
  timeZone: string;
  rules: ServiceRules;
  bands: readonly PartyBand[];
  partySize: number;
  remaining: RemainingLookup;
  now: Date;
  /** The host stand passes true; the public page passes `rules.allowPublicUpsize`. */
  allowUpsize: boolean;
}): AvailabilityResult {
  const { resolved, timeZone, rules, bands, partySize, remaining, now, allowUpsize } = input;

  if (!rules.isActive) return { ok: false, reason: "reservations_off" };
  if (partySize < rules.partySizeMin) return { ok: false, reason: "party_below_minimum" };
  if (partySize > rules.partySizeMax) return { ok: false, reason: "party_above_maximum" };

  const fits = bandsForParty(bands, partySize, { allowUpsize });
  if (fits.length === 0) return { ok: false, reason: "no_band_fits_this_party" };

  const turnMinutes = resolved.turnMinutesOverride ?? turnMinutesForParty(rules, partySize);
  const candidates = seatingTimesFor({ resolved, timeZone, turnMinutes });
  if (candidates.length === 0) return { ok: false, reason: "fully_booked" };

  const earliest = now.getTime() + rules.minNoticeMinutes * 60_000;
  const horizon = now.getTime() + rules.horizonDays * 24 * 60 * 60_000;

  let sawInNotice = false;
  const times: OfferedTime[] = [];

  for (const candidate of candidates) {
    const at = candidate.startsAt.getTime();
    if (at < earliest) continue;
    if (at > horizon) continue;
    sawInNotice = true;

    // First band with a unit free wins, in best-first order.
    for (const fit of fits) {
      const left = remaining(fit.band.poolId, candidate.startsAt, candidate.endsAt);
      // A lookup that cannot tell is NOT a free table. Treating an unknown as
      // available is how a page offers a table that is not there.
      if (left === null || left < 1) continue;
      times.push({ ...candidate, band: fit.band, isUpsize: fit.isUpsize });
      break;
    }
  }

  if (times.length === 0) {
    return { ok: false, reason: sawInNotice ? "fully_booked" : "inside_minimum_notice" };
  }

  // isLastSeating was set against the window's grid; re-mark it against what is
  // actually offered, or a page labels a sold-out time "last table".
  for (const t of times) t.isLastSeating = false;
  times[times.length - 1]!.isLastSeating = true;

  return { ok: true, times };
}
