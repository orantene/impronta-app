import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DUNNING_GRACE_DAYS, isDunningExpired, nextPastDueSince, resolveDunningGrace } from "./dunning-grace";
import { effectiveEntitlementPlan, hasEntitlement } from "../access/talent-entitlements";

const T0 = "2026-10-01T12:00:00.000Z";
const at = (days: number, extraMs = 0) => new Date(Date.parse(T0) + days * 86_400_000 + extraMs);

describe("resolveDunningGrace table", () => {
  const rows: Array<{ name: string; status: string | null; since: string | null; now: Date; phase: string }> = [
    { name: "active is none", status: "active", since: null, now: at(30), phase: "none" },
    { name: "null status is none", status: null, since: T0, now: at(30), phase: "none" },
    { name: "cancelled is none", status: "cancelled", since: T0, now: at(30), phase: "none" },
    { name: "failure moment is grace", status: "past_due", since: T0, now: at(0), phase: "grace" },
    { name: "day 6 is grace", status: "past_due", since: T0, now: at(6), phase: "grace" },
    { name: "one ms before day 7 is grace", status: "past_due", since: T0, now: at(7, -1), phase: "grace" },
    { name: "exactly day 7 is expired", status: "past_due", since: T0, now: at(7), phase: "expired" },
    { name: "day 30 is expired", status: "past_due", since: T0, now: at(30), phase: "expired" },
    { name: "missing since fails open to grace", status: "past_due", since: null, now: at(30), phase: "grace" },
    { name: "garbage since fails open to grace", status: "past_due", since: "nope", now: at(30), phase: "grace" },
  ];
  for (const r of rows) {
    test(r.name, () => {
      assert.equal(resolveDunningGrace({ status: r.status, pastDueSince: r.since, now: r.now }).phase, r.phase);
    });
  }

  test("daysLeft counts down and never hits 0 inside grace", () => {
    const s = (d: number, ms = 0) => resolveDunningGrace({ status: "past_due", pastDueSince: T0, now: at(d, ms) });
    assert.deepEqual(
      [s(0), s(3), s(6, 1000), s(7, -1)].map((x) => (x.phase === "grace" ? x.daysLeft : -1)),
      [DUNNING_GRACE_DAYS, 4, 1, 1],
    );
  });
});

describe("nextPastDueSince", () => {
  const now = at(2);
  test("transition into past_due stamps now", () => {
    assert.equal(nextPastDueSince("past_due", null, now), now.toISOString());
  });
  test("Smart Retry updates keep the original failure time", () => {
    assert.equal(nextPastDueSince("past_due", T0, now), T0);
  });
  test("recovery or end clears it", () => {
    for (const s of ["active", "trialing", "cancelled"]) assert.equal(nextPastDueSince(s, T0, now), null);
  });
});

describe("effectiveEntitlementPlan (entitlement resolver)", () => {
  test("paid plan inside grace keeps features", () => {
    const plan = effectiveEntitlementPlan("talent_portfolio", { status: "past_due", pastDueSince: T0 }, at(3));
    assert.equal(plan, "talent_portfolio");
    assert.equal(hasEntitlement(plan, "profile.noPlatformBadge"), true);
  });
  test("past grace reads as Free", () => {
    const plan = effectiveEntitlementPlan("talent_portfolio", { status: "past_due", pastDueSince: T0 }, at(8));
    assert.equal(plan, "talent_basic");
    assert.equal(hasEntitlement(plan, "profile.noPlatformBadge"), false);
    assert.equal(isDunningExpired({ status: "past_due", pastDueSince: T0, now: at(8) }), true);
  });
  test("active or no billing row is untouched", () => {
    assert.equal(effectiveEntitlementPlan("talent_pro", { status: "active", pastDueSince: null }, at(99)), "talent_pro");
    assert.equal(effectiveEntitlementPlan("talent_pro", null, at(99)), "talent_pro");
    assert.equal(effectiveEntitlementPlan(null, null, at(99)), "talent_basic");
  });
});
