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

test("a session already over falls back to the pool TTL rather than a zero hold", () => {
  // The order is still valid — someone may be buying at the door of a running
  // event — it just has no future end to hold against. A zero or negative TTL
  // would be a hold that expires before it exists.
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

test("an absurdly distant session is CLAMPED — an unbounded hold is the bug we avoided", () => {
  // A hold nothing reclaims is the commit-has-no-TTL problem under a new name,
  // which is why the ruling went the way it did.
  const r = doorHoldSeconds({
    paymentChoice: "in_person",
    sessionEnds: [at("2099-01-01T00:00:00.000Z")],
    now: NOW,
  });
  assert.equal(r.ok && r.seconds, MAX_DOOR_HOLD_SECONDS);
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
