import test from "node:test";
import assert from "node:assert/strict";
import { planWalkIn, walkInOptions } from "./walkin";
import { parseServiceRules } from "./rules";
import type { PartyBand } from "./availability";

const TWO: PartyBand = { groupId: "g2", poolId: "p2", name: "two-tops", partyMin: 1, partyMax: 2 };
const FOUR: PartyBand = { groupId: "g4", poolId: "p4", name: "four-tops", partyMin: 3, partyMax: 4 };
const EIGHT: PartyBand = { groupId: "g8", poolId: "p8", name: "eight-top", partyMin: 5, partyMax: 8 };
const ALL = [TWO, FOUR, EIGHT];

const NOW = new Date("2026-09-06T01:07:00Z"); // Sat 5 Sept, 20:07 Cancun

const rules = (over: Record<string, unknown> = {}) =>
  parseServiceRules(
    { is_active: true, walkins_enabled: true, party_size_min: 1, party_size_max: 8,
      default_turn_minutes: 90, ...over },
    "v1",
  );

test("a walk-in's window starts NOW, not at the next slot on the grid", () => {
  // Rounding to the grid would refuse a party at 20:07 for a table that is
  // empty, and a host works around a system that refuses.
  const d = planWalkIn({ rules: rules(), bands: ALL, partySize: 4, now: NOW });
  assert.ok(d.ok);
  assert.equal(d.plan.startsAt.toISOString(), NOW.toISOString());
});

test("the turn is added to the INSTANT", () => {
  const d = planWalkIn({ rules: rules(), bands: ALL, partySize: 4, now: NOW });
  assert.ok(d.ok);
  assert.equal((d.plan.endsAt.getTime() - d.plan.startsAt.getTime()) / 60_000, 90);
});

test("the turn comes from the party's band, so a big walk-in holds longer", () => {
  const d = planWalkIn({
    rules: rules({
      turn_time_bands: [
        { minParty: 1, maxParty: 4, turnMinutes: 90 },
        { minParty: 5, maxParty: 8, turnMinutes: 150 },
      ],
    }),
    bands: ALL,
    partySize: 8,
    now: NOW,
  });
  assert.ok(d.ok);
  assert.equal(d.plan.turnMinutes, 150);
});

test("UPSIZING IS ALWAYS ALLOWED at the host stand, whatever the website setting says", () => {
  // A human is looking at the room. If the two-tops are by the kitchen door,
  // seating a deuce at a four-top is the correct call and the software's
  // opinion is not wanted.
  const websiteSaysNo = rules({ allow_public_upsize: false });
  const options = walkInOptions(ALL, 2);
  assert.deepEqual(
    options.map((o) => [o.band.name, o.isUpsize]),
    [["two-tops", false], ["four-tops", true], ["eight-top", true]],
  );
  // And when the two-tops are not an option at all, the plan still finds one.
  const d = planWalkIn({ rules: websiteSaysNo, bands: [FOUR, EIGHT], partySize: 2, now: NOW });
  assert.ok(d.ok);
  assert.equal(d.plan.band.name, "four-tops");
  assert.equal(d.plan.isUpsize, true, "flagged, so the host sees it is oversized");
});

test("smallest that fits first, so a deuce does not take the eight-top", () => {
  const d = planWalkIn({ rules: rules(), bands: ALL, partySize: 2, now: NOW });
  assert.ok(d.ok);
  assert.equal(d.plan.band.name, "two-tops");
});

test("a party no band can seat is refused with the reason, not with an empty plan", () => {
  assert.deepEqual(planWalkIn({ rules: rules(), bands: [TWO, FOUR], partySize: 6, now: NOW }), {
    ok: false,
    reason: "no_band_fits_this_party",
  });
});

test("a venue with walk-ins switched off refuses before anything else", () => {
  assert.deepEqual(
    planWalkIn({ rules: rules({ walkins_enabled: false }), bands: ALL, partySize: 2, now: NOW }),
    { ok: false, reason: "walkins_off" },
  );
});

test("party size outside the venue's range says WHICH end it broke", () => {
  assert.deepEqual(
    planWalkIn({ rules: rules({ party_size_max: 4 }), bands: ALL, partySize: 6, now: NOW }),
    { ok: false, reason: "party_above_maximum" },
  );
  assert.deepEqual(
    planWalkIn({ rules: rules({ party_size_min: 2 }), bands: ALL, partySize: 1, now: NOW }),
    { ok: false, reason: "party_below_minimum" },
  );
});

test("the host is offered EVERY band that fits, not only the best one", () => {
  // Our ranking is smallest-that-fits; a human's is "not the one by the
  // toilets". Ours is a default, not a decision.
  assert.equal(walkInOptions(ALL, 2).length, 3);
  assert.equal(walkInOptions(ALL, 6).length, 1);
  assert.equal(walkInOptions(ALL, 12).length, 0, "nothing seats twelve here");
});
