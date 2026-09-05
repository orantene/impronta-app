/**
 * walkin.ts — seating somebody who did not book.
 *
 * A WALK-IN CONSUMES CAPACITY AND HAS NO ORDER. That pairing is the whole
 * point: the floor cannot oversell, because the band pool does not care whether
 * a unit was claimed online or at the door — and no money moved, because nobody
 * bought anything. The CEO's cash ruling says the same thing from the other
 * side: we never touch that money, so there is nothing to take a fee from.
 *
 * IT IS A CREATE-THEN-ADMIT, NOT AN ADMIT. There is no admission row until the
 * host makes one. Events & Ticketing's `check_in` admits people to rows that
 * exist and deliberately does not grow a create mode; this is the create half,
 * and it lives here because a walk-in is a reservation-shaped thing and not a
 * door-shaped one.
 *
 * THE SEATING WINDOW STARTS NOW, NOT AT A SLOT. A booked table holds
 * [T, T+turn) for a time chosen in advance; a walk-in holds [now, now+turn),
 * because they are standing there. Rounding that to the seating grid would
 * refuse a party at 20:07 for a table that is empty, which is a system a host
 * works around — and a host working around the floor plan is how the floor plan
 * stops matching the room.
 *
 * PURE decision half. The write half is in store.ts alongside the other
 * persistence, so nothing reaches these tables except through one module.
 */

import type { PartyBand } from "./availability";
import { bandsForParty } from "./availability";
import { turnMinutesForParty } from "./rules";
import type { ServiceRules } from "./types";

export type WalkInRefusal =
  | "walkins_off"
  | "party_below_minimum"
  | "party_above_maximum"
  | "no_band_fits_this_party";

export type WalkInPlan = {
  band: PartyBand;
  /** The party is under this band's minimum: two people at a four-top. */
  isUpsize: boolean;
  startsAt: Date;
  endsAt: Date;
  turnMinutes: number;
};

export type WalkInDecision =
  | { ok: true; plan: WalkInPlan }
  | { ok: false; reason: WalkInRefusal };

/**
 * Which band to seat a walk-in in, and for how long.
 *
 * `allowUpsize` is ALWAYS TRUE at the host stand and is not a parameter. A
 * human is looking at the room: if the two-tops are by the kitchen door and the
 * four-tops are empty, seating a deuce at a four-top is the correct call and
 * the software's opinion is not wanted. `allowPublicUpsize` governs the website,
 * where nobody is looking.
 *
 * Availability is NOT decided here. Whether that band has a unit free is
 * `reserve_capacity` under the pool's row lock, same as every other claim in
 * this area — a pre-check would lose the race it was trying to win.
 */
export function planWalkIn(input: {
  rules: ServiceRules;
  bands: readonly PartyBand[];
  partySize: number;
  now: Date;
}): WalkInDecision {
  const { rules, bands, partySize, now } = input;

  if (!rules.walkinsEnabled) return { ok: false, reason: "walkins_off" };
  if (partySize < rules.partySizeMin) return { ok: false, reason: "party_below_minimum" };
  if (partySize > rules.partySizeMax) return { ok: false, reason: "party_above_maximum" };

  const fits = bandsForParty(bands, partySize, { allowUpsize: true });
  if (fits.length === 0) return { ok: false, reason: "no_band_fits_this_party" };

  const turnMinutes = turnMinutesForParty(rules, partySize);
  const startsAt = new Date(now.getTime());
  // Instant arithmetic, like every other duration in this area. A turn added to
  // a wall clock loses an hour on the one night a year that has one fewer.
  const endsAt = new Date(startsAt.getTime() + turnMinutes * 60_000);

  const best = fits[0]!;
  return {
    ok: true,
    plan: { band: best.band, isUpsize: best.isUpsize, startsAt, endsAt, turnMinutes },
  };
}

/**
 * The bands a host could seat this party in, best first, with the upsize flag.
 *
 * The host stand shows all of them rather than only the best, because the
 * software's ranking is smallest-that-fits and a human's ranking is "not the
 * one by the toilets". Ours is a default, not a decision.
 */
export function walkInOptions(
  bands: readonly PartyBand[],
  partySize: number,
): Array<{ band: PartyBand; isUpsize: boolean }> {
  return bandsForParty(bands, partySize, { allowUpsize: true });
}
