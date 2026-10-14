import { test } from "node:test";
import assert from "node:assert/strict";

import { decideUpgradeRoute, offerIntervals, upgradeOfferPrice } from "./upgrade-offer";

test("no live subscription goes to checkout", () => {
  for (const status of [null, "canceled", "incomplete_expired", "incomplete"]) {
    assert.equal(
      decideUpgradeRoute({ currentPlanKey: null, subscriptionStatus: status, target: "talent_portfolio" }),
      "checkout",
    );
  }
});

test("live subscriber switches in place; same plan is current", () => {
  assert.equal(
    decideUpgradeRoute({ currentPlanKey: "talent_pro", subscriptionStatus: "active", target: "talent_portfolio" }),
    "plan_change",
  );
  assert.equal(
    decideUpgradeRoute({ currentPlanKey: "talent_pro", subscriptionStatus: "trialing", target: "talent_portfolio" }),
    "plan_change",
  );
  assert.equal(
    decideUpgradeRoute({ currentPlanKey: "talent_portfolio", subscriptionStatus: "active", target: "talent_portfolio" }),
    "current",
  );
});

test("past_due must fix payment before anything else", () => {
  assert.equal(
    decideUpgradeRoute({ currentPlanKey: "talent_pro", subscriptionStatus: "past_due", target: "talent_portfolio" }),
    "fix_payment",
  );
});

test("yearly toggle only for checkout with a yearly catalog price", () => {
  assert.deepEqual(offerIntervals({ yearlyAvailable: true, route: "checkout" }), ["month", "year"]);
  assert.deepEqual(offerIntervals({ yearlyAvailable: false, route: "checkout" }), ["month"]);
  assert.deepEqual(offerIntervals({ yearlyAvailable: true, route: "plan_change" }), ["month"]);
});

test("monthly price", () => {
  assert.deepEqual(
    upgradeOfferPrice({ monthlyCents: 1500, annualCents: 15000, interval: "month", yearlyAvailable: true }),
    { interval: "month", perMonth: "$15", billed: "$15", savingsPercent: 0 },
  );
});

test("yearly price comes from the catalog annual figure with savings", () => {
  assert.deepEqual(
    upgradeOfferPrice({ monthlyCents: 1500, annualCents: 15000, interval: "year", yearlyAvailable: true }),
    { interval: "year", perMonth: "$12.50", billed: "$150", savingsPercent: 17 },
  );
});

test("yearly requested without a yearly price shows monthly, never a made-up figure", () => {
  assert.deepEqual(
    upgradeOfferPrice({ monthlyCents: 1500, annualCents: 15000, interval: "year", yearlyAvailable: false }),
    { interval: "month", perMonth: "$15", billed: "$15", savingsPercent: 0 },
  );
  assert.equal(upgradeOfferPrice({ monthlyCents: null, annualCents: null, interval: "month", yearlyAvailable: false }), null);
});
