import test from "node:test";
import assert from "node:assert/strict";
import { availabilityForWindow, bandsForParty, type PartyBand } from "./availability";
import { parseServiceRules } from "./rules";
import { resolveWindowOnDate } from "./windows";
import type { ServiceWindow } from "./types";

const CANCUN = "America/Cancun";

const TWO_TOPS: PartyBand = { groupId: "g2", poolId: "p2", name: "two-tops", partyMin: 1, partyMax: 2 };
const FOUR_TOPS: PartyBand = { groupId: "g4", poolId: "p4", name: "four-tops", partyMin: 3, partyMax: 4 };
const EIGHT_TOP: PartyBand = { groupId: "g8", poolId: "p8", name: "eight-top", partyMin: 5, partyMax: 8 };
const ALL = [TWO_TOPS, FOUR_TOPS, EIGHT_TOP];

const dinner: ServiceWindow = {
  id: "w-dinner",
  venueId: "v1",
  key: "dinner",
  localTimeMin: 19 * 60,
  durationMinutes: 240,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  lastSeatingOffsetMin: null,
  seatingStepMinutes: 30,
  turnMinutesOverride: null,
  startsOn: "2026-01-01",
  endsOn: null,
  isActive: true,
};

const rules = (over: Record<string, unknown> = {}) =>
  parseServiceRules(
    {
      is_active: true,
      party_size_min: 1,
      party_size_max: 8,
      min_notice_minutes: 0,
      horizon_days: 60,
      default_turn_minutes: 90,
      ...over,
    },
    "v1",
  );

const window = () => {
  const r = resolveWindowOnDate({
    window: dinner,
    exceptions: [],
    onDate: "2026-09-05",
    timeZone: CANCUN,
    defaultTurnMinutes: 90,
  });
  assert.ok(r.ok);
  return r.window;
};

const NOW = new Date("2026-09-05T12:00:00Z"); // 07:00 in Cancun, well before service
const plenty = () => 6;
const none = () => 0;

const run = (over: {
  partySize: number;
  bands?: PartyBand[];
  remaining?: (poolId: string, s: Date, e: Date) => number | null;
  allowUpsize?: boolean;
  rulesOver?: Record<string, unknown>;
  now?: Date;
}) =>
  availabilityForWindow({
    resolved: window(),
    timeZone: CANCUN,
    rules: rules(over.rulesOver),
    bands: over.bands ?? ALL,
    partySize: over.partySize,
    remaining: over.remaining ?? plenty,
    now: over.now ?? NOW,
    allowUpsize: over.allowUpsize ?? false,
  });

// ─── party size selects a band; it is never a quantity ───────────────────────

test("a party of four is offered the FOUR-top band, one unit, not four", () => {
  const r = run({ partySize: 4 });
  assert.ok(r.ok);
  assert.equal(r.times[0]!.band.name, "four-tops");
  // The unit count is implicit: availability asks for >= 1 on one pool. If this
  // ever asks for partySize units it will sell one table per guest.
  assert.ok(r.times.length > 0);
});

test("a party of six is offered NOTHING when only two-tops and four-tops exist", () => {
  assert.deepEqual(run({ partySize: 6, bands: [TWO_TOPS, FOUR_TOPS] }), {
    ok: false,
    reason: "no_band_fits_this_party",
  });
});

test("a party of six IS offered the eight-top when it is free", () => {
  const r = run({ partySize: 6 });
  assert.ok(r.ok);
  assert.equal(r.times[0]!.band.name, "eight-top");
});

// ─── upsizing: allowed and flagged, never silent, never refused outright ─────

test("a deuce is NOT offered a four-top online by default", () => {
  const twoTopsFull = (poolId: string) => (poolId === "p2" ? 0 : 6);
  assert.deepEqual(run({ partySize: 2, remaining: twoTopsFull, allowUpsize: false }), {
    ok: false,
    reason: "fully_booked",
  });
});

test("a deuce IS offered a four-top when the venue allows upsizing, and it is FLAGGED", () => {
  const twoTopsFull = (poolId: string) => (poolId === "p2" ? 0 : 6);
  const r = run({ partySize: 2, remaining: twoTopsFull, allowUpsize: true });
  assert.ok(r.ok);
  assert.equal(r.times[0]!.band.name, "four-tops");
  assert.equal(r.times[0]!.isUpsize, true, "the host must be able to see it is oversized");
});

test("smallest that fits first: a deuce takes a two-top, not the eight-top", () => {
  const r = run({ partySize: 2, allowUpsize: true });
  assert.ok(r.ok);
  assert.equal(r.times[0]!.band.name, "two-tops");
  assert.equal(r.times[0]!.isUpsize, false);
});

test("bandsForParty orders exact before upsized, then smallest first", () => {
  const fits = bandsForParty(ALL, 2, { allowUpsize: true });
  assert.deepEqual(
    fits.map((f) => [f.band.name, f.isUpsize]),
    [
      ["two-tops", false],
      ["four-tops", true],
      ["eight-top", true],
    ],
  );
});

test("a band too small is never a candidate, at any policy", () => {
  assert.deepEqual(bandsForParty(ALL, 6, { allowUpsize: true }).map((f) => f.band.name), [
    "eight-top",
  ]);
});

// ─── an unknown is not a free table ──────────────────────────────────────────

test("a remaining lookup that cannot tell is treated as UNAVAILABLE, never as free", () => {
  // Treating an unknown as available is how a page offers a table that is not
  // there, and the guest finds out at the door.
  assert.deepEqual(run({ partySize: 4, remaining: () => null }), {
    ok: false,
    reason: "fully_booked",
  });
});

test("a full house refuses rather than offering an empty list", () => {
  assert.deepEqual(run({ partySize: 4, remaining: none }), {
    ok: false,
    reason: "fully_booked",
  });
});

// ─── notice, horizon and the party-size gate ─────────────────────────────────

test("minimum notice is applied to the SEATING, not to the window", () => {
  // 18:30 Cancun with a two-hour notice: 19:00 and 20:00 are gone, 20:30 is not.
  const now = new Date("2026-09-05T23:30:00Z"); // 18:30 local
  const r = run({ partySize: 4, rulesOver: { min_notice_minutes: 120 }, now });
  assert.ok(r.ok);
  assert.equal(r.times[0]!.localLabel, "20:30");
  assert.ok(!r.times.some((t) => t.localLabel === "19:00"));
});

test("everything inside the notice window refuses with its OWN reason, not 'fully booked'", () => {
  const now = new Date("2026-09-06T02:00:00Z"); // 21:00 local, past the last seating
  assert.deepEqual(run({ partySize: 4, rulesOver: { min_notice_minutes: 240 }, now }), {
    ok: false,
    reason: "inside_minimum_notice",
  });
});

test("a date beyond the horizon offers nothing", () => {
  const r = run({ partySize: 4, rulesOver: { horizon_days: 1 }, now: new Date("2026-08-01T12:00:00Z") });
  assert.equal(r.ok, false);
});

test("party size outside the venue's range is refused with which end it broke", () => {
  assert.deepEqual(run({ partySize: 12, rulesOver: { party_size_max: 8 } }), {
    ok: false,
    reason: "party_above_maximum",
  });
  assert.deepEqual(run({ partySize: 1, rulesOver: { party_size_min: 2 } }), {
    ok: false,
    reason: "party_below_minimum",
  });
});

test("a venue that has not switched reservations on refuses before anything else", () => {
  assert.deepEqual(run({ partySize: 4, rulesOver: { is_active: false } }), {
    ok: false,
    reason: "reservations_off",
  });
});

// ─── the label a page prints ─────────────────────────────────────────────────

test("'last table' marks the last OFFERED time, not the last time in the grid", () => {
  // The grid runs to 21:30. If 21:00 and 21:30 are sold out, the badge must sit
  // on 20:30 — otherwise a page labels a sold-out slot "last table".
  const lateFull = (_p: string, s: Date) =>
    s.getTime() >= new Date("2026-09-06T02:00:00Z").getTime() ? 0 : 6;
  const r = run({ partySize: 4, remaining: lateFull });
  assert.ok(r.ok);
  const flagged = r.times.filter((t) => t.isLastSeating);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0]!.localLabel, r.times[r.times.length - 1]!.localLabel);
  assert.ok(!r.times.some((t) => t.localLabel === "21:00"));
});

test("the turn time comes from the party's band, so a big party holds longer", () => {
  const r = run({
    partySize: 8,
    rulesOver: {
      turn_time_bands: [
        { minParty: 1, maxParty: 4, turnMinutes: 90 },
        { minParty: 5, maxParty: 8, turnMinutes: 150 },
      ],
    },
  });
  assert.ok(r.ok);
  const held = (r.times[0]!.endsAt.getTime() - r.times[0]!.startsAt.getTime()) / 60_000;
  assert.equal(held, 150);
});
