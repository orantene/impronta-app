import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRosterSeatAvailability,
  resolvePublicRosterDisplayCap,
} from "./roster-seat-limit";

test("roster seat availability allows unlimited plans", () => {
  const result = evaluateRosterSeatAvailability({
    planTier: "network",
    limit: null,
    current: 240,
    additionalSeats: 1,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.after, 241);
  }
});

test("roster seat availability allows writes within the cap", () => {
  const result = evaluateRosterSeatAvailability({
    planTier: "free",
    limit: 5,
    current: 4,
    additionalSeats: 1,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.after, 5);
  }
});

test("roster seat availability blocks writes over cap with free-plan copy", () => {
  const result = evaluateRosterSeatAvailability({
    planTier: "free",
    limit: 5,
    current: 5,
    additionalSeats: 1,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /Free plan limit/i);
    assert.equal(result.current, 5);
    assert.equal(result.after, 6);
  }
});

test("roster seat availability blocks writes over cap with generic copy on paid plans", () => {
  const result = evaluateRosterSeatAvailability({
    planTier: "studio",
    limit: 50,
    current: 50,
    additionalSeats: 1,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /plan limit/i);
    assert.equal(result.limit, 50);
  }
});

test("public roster display cap defaults free workspaces to five", () => {
  assert.equal(resolvePublicRosterDisplayCap("free", null), 5);
});

test("public roster display cap respects explicit tenant limit", () => {
  assert.equal(resolvePublicRosterDisplayCap("agency", 12), 12);
  assert.equal(resolvePublicRosterDisplayCap("free", 3), 3);
});

test("public roster display cap stays uncapped on paid plans without limit", () => {
  assert.equal(resolvePublicRosterDisplayCap("studio", null), null);
});

test("a zero-seat plan says it has no roster instead of offering more seats", () => {
  // Website ($12 site-builder tier) has PLAN_SEAT_CAPS.website = 0. "Upgrade
  // to add more" would misdescribe what the customer bought.
  const verdict = evaluateRosterSeatAvailability({
    planTier: "website",
    limit: 0,
    current: 0,
  });
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.limit, 0);
  assert.match(verdict.message, /does not include a talent roster/i);
  assert.match(verdict.message, /Upgrade to Studio/i);
});
