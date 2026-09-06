import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_DOOR_HOLD_SECONDS,
  MIN_DOOR_HOLD_SECONDS,
  doorHoldSeconds,
} from "./door-hold";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const at = (iso: string) => iso;

test("A DOOR ORDER'S HOLD CARRIES THE SESSION END AS ITS EXPIRY", () => {
  // The ruling, and the assertion the CEO asked for. Doors open long after a
  // fifteen-minute pool TTL would have lapsed.
  const r = doorHoldSeconds({
    paymentChoice: "in_person",
    sessionEnds: [at("2026-09-05T18:30:00.000Z")],
    now: NOW,
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.seconds, 6.5 * 60 * 60, "six and a half hours, to the session end");
});

test("a card order is NOT extended — it is bounded by Checkout, not the event", () => {
  for (const choice of ["full", "deposit"]) {
    const r = doorHoldSeconds({
      paymentChoice: choice,
      sessionEnds: [at("2026-09-05T18:30:00.000Z")],
      now: NOW,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "not_a_door_order");
  }
});

test("an order spanning two sessions holds until the LATEST ends", () => {
  // The earliest would lapse the second session's seat while the customer is
  // still at the first.
  const r = doorHoldSeconds({
    paymentChoice: "in_person",
    sessionEnds: [at("2026-09-05T14:00:00.000Z"), at("2026-09-05T20:00:00.000Z")],
    now: NOW,
  });
  assert.equal(r.ok && r.seconds, 8 * 60 * 60);
});

test("a session already over REFUSES — it is a mistake, not a late sale", () => {
  // I had this falling back, reasoning that someone buying at the door of a
  // running event is a real customer. Events corrected it: that person is the
  // door's own `sellAtDoor`, which commits immediately and holds nothing. An
  // ONLINE pay-at-the-door order for a finished session would otherwise buy a
  // pool-TTL hold on a seat nobody can use.
  const r = doorHoldSeconds({
    paymentChoice: "in_person",
    sessionEnds: [at("2026-09-05T11:00:00.000Z")],
    now: NOW,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "already_ended");
});

test("a session ending in seconds is not worth holding for", () => {
  const r = doorHoldSeconds({
    paymentChoice: "in_person",
    sessionEnds: [new Date(NOW.getTime() + 30_000)],
    now: NOW,
  });
  assert.equal(r.ok, false, `under ${MIN_DOOR_HOLD_SECONDS}s falls back`);
});

test("the clamp is the ENGINE's cap, not a number I chose", () => {
  // `capacity_pools_hold_ttl_seconds_check` is BETWEEN 30 AND 604800 and
  // `_capacity_reserve_locked` raises CP007 above it. My first version clamped
  // at 30 days, which passes here and DIES AT RESERVE — a session eight days
  // out would have been refused by the database with an opaque code after
  // everything upstream succeeded. Events caught it.
  const r = doorHoldSeconds({
    paymentChoice: "in_person",
    sessionEnds: [at("2099-01-01T00:00:00.000Z")],
    now: NOW,
  });
  assert.equal(r.ok && r.seconds, MAX_DOOR_HOLD_SECONDS);
  assert.equal(MAX_DOOR_HOLD_SECONDS, 604800, "the engine's cap, in its own units");
});

test("a session 8 days out clamps to 7 — the case that would have died at reserve", () => {
  const eightDays = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
  const r = doorHoldSeconds({ paymentChoice: "in_person", sessionEnds: [eightDays], now: NOW });
  assert.equal(r.ok && r.seconds, 604800, "clamped below CP007 rather than raising it");
});

test("null, missing and unparseable ends are skipped, not treated as now", () => {
  // `Date.parse("tomorrow")` is NaN. Treating that as 0 would make the hold
  // expire instantly on a line whose session data is merely untidy.
  const r = doorHoldSeconds({
    paymentChoice: "in_person",
    sessionEnds: [null, undefined, "tomorrow", at("2026-09-05T16:00:00.000Z")],
    now: NOW,
  });
  assert.equal(r.ok && r.seconds, 4 * 60 * 60, "the one real end still wins");
});

test("no session ends at all falls back rather than guessing", () => {
  const r = doorHoldSeconds({ paymentChoice: "in_person", sessionEnds: [], now: NOW });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "no_session_end");
});
