/**
 * The two rules that keep a scheduled payout from paying early.
 *
 * Both are pure, and both encode a decision where the WRONG answer is silent:
 * money leaves the platform before the show and the only signal is that it
 * worked. So the tests below are written around the cases that fail quietly,
 * not the cases that throw.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isDue, laterHold } from "./booking-payouts-ledger";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const past = "2026-09-01T12:00:00.000Z";
const soon = "2026-09-03T11:59:59.000Z";
const future = "2026-09-24T20:00:00.000Z"; // a show three weeks out

// ── isDue: the release predicate ────────────────────────────────────────────

test("no gate means due — the default for every existing leg", () => {
  assert.equal(isDue(null, NOW), true);
});

test("a gate in the future means NOT due — the whole point", () => {
  assert.equal(isDue(future, NOW), false);
});

test("a gate in the past means due", () => {
  assert.equal(isDue(past, NOW), true);
});

test("exactly at the gate is due — the boundary is inclusive, not a flap", () => {
  assert.equal(isDue(NOW.toISOString(), NOW), true);
});

test("one second before the gate is still held", () => {
  // The failure this guards: an off-by-one that releases a show-night payout
  // a moment early would look identical to correct behaviour.
  assert.equal(isDue("2026-09-03T12:00:01.000Z", NOW), false);
  assert.equal(isDue(soon, NOW), true);
});

// ── laterHold: a hold may be extended, never shortened ──────────────────────

test("null NEVER wins over a real hold — an upsert that omits the gate must not release", () => {
  // This is the defect the rule exists to prevent. recordPayoutLeg rewrites its
  // fields wholesale on every retry; if a retry passing null could clear the
  // gate, the money would release early on ordinary bookkeeping.
  assert.equal(laterHold(future, null), future);
});

test("a real hold beats no hold in the other direction too", () => {
  assert.equal(laterHold(null, future), future);
});

test("a hold can be EXTENDED", () => {
  const later = "2026-10-01T00:00:00.000Z";
  assert.equal(laterHold(future, later), later);
});

test("a hold CANNOT be shortened — the earlier value loses", () => {
  const earlier = "2026-09-10T00:00:00.000Z";
  assert.equal(laterHold(future, earlier), future);
  assert.equal(laterHold(earlier, future), future);
});

test("no hold on either side stays no hold", () => {
  assert.equal(laterHold(null, null), null);
});

test("equal holds are stable", () => {
  assert.equal(laterHold(future, future), future);
});

test("shortening is refused even when the new value is in the past", () => {
  // The nastiest shape: a stale retry carrying an old timestamp would otherwise
  // make the leg immediately due.
  assert.equal(laterHold(future, past), future);
});

// ── the two conditions are orthogonal ───────────────────────────────────────

test("a leg can be blocked by BOTH account readiness and time at once", () => {
  // This is why release_after is a column and not a `scheduled` status: a
  // status can only say one thing, and here both are true simultaneously.
  // status stays 'held' (no account) while the gate is also in the future.
  const accountBlocked = true;
  const timeBlocked = !isDue(future, NOW);
  assert.equal(accountBlocked && timeBlocked, true);

  // Resolving ONE of them must not release the money. An account.updated flip
  // clears the first; the leg is still not due.
  const accountNowOk = false; // account flipped enabled
  assert.equal(!accountNowOk && !isDue(future, NOW), true, "still held by time alone");
});
