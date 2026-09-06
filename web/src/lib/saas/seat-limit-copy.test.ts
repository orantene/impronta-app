import assert from "node:assert/strict";
import { test } from "node:test";

import {
  seatLimitMessage,
  cheapestPlanRaisingSeatCap,
  seatCapFor,
} from "./seat-limit-copy";

test("THE TRAP: a roster wall never offers Website, which seats nobody", () => {
  // Website is ranked between Free and Studio and costs more than Free, so
  // every "next plan up" or "cheapest paid plan" rule offers it here. Its
  // roster cap is 0. Sending someone who just ran out of seats to a tier with
  // FEWER seats, for money, is the specific failure this helper exists to stop.
  assert.equal(seatCapFor("roster", "website"), 0);
  const offer = cheapestPlanRaisingSeatCap("roster", "free");
  assert.equal(offer?.planKey, "studio");
  assert.doesNotMatch(seatLimitMessage({ kind: "roster", planTier: "free", limit: 5 }), /Website/);
});

test("offers the next plan that genuinely raises the cap", () => {
  assert.equal(cheapestPlanRaisingSeatCap("roster", "studio")?.planKey, "agency");
  // Team seats: free 2 → studio 3 is a real increase, so Studio qualifies.
  assert.equal(seatCapFor("team", "website"), 2);
  assert.equal(cheapestPlanRaisingSeatCap("team", "free")?.planKey, "studio");
});

test("equal is not an upgrade", () => {
  // Website's team cap equals Free's (2). A rule that accepted >= would offer
  // a paid plan that changes nothing about the wall the user just hit.
  assert.equal(seatCapFor("team", "free"), seatCapFor("team", "website"));
  assert.notEqual(cheapestPlanRaisingSeatCap("team", "free")?.planKey, "website");
});

test("an already-unlimited plan is offered nothing", () => {
  // A paywall on a wall that does not exist.
  assert.equal(seatCapFor("roster", "agency"), null);
  assert.equal(cheapestPlanRaisingSeatCap("roster", "agency"), null);
  assert.match(
    seatLimitMessage({ kind: "roster", planTier: "agency", limit: 999 }),
    /Talk to us/i,
  );
});

test("both walls state the plan the caller is on, and the one that lifts it", () => {
  const roster = seatLimitMessage({ kind: "roster", planTier: "free", limit: 5 });
  assert.match(roster, /Free plan limit \(5 profiles\)/);
  assert.match(roster, /Upgrade to Studio to raise it/);

  const team = seatLimitMessage({ kind: "team", planTier: "free", limit: 2 });
  assert.match(team, /2 team seats, including pending invites/);
  assert.match(team, /Upgrade to Studio/);
});

test("localised, with English as the fallback for anything unknown", () => {
  const es = seatLimitMessage({ kind: "roster", planTier: "free", limit: 5, locale: "es" });
  assert.match(es, /límite del plan Free \(5 perfiles\)/);
  assert.match(es, /Mejora a Studio/);
  assert.match(
    seatLimitMessage({ kind: "roster", planTier: "free", limit: 5, locale: "fr" }),
    /Upgrade to Studio/,
  );
});

test("no message carries a price, in any locale", () => {
  for (const locale of ["en", "es"]) {
    for (const kind of ["roster", "team"] as const) {
      const msg = seatLimitMessage({ kind, planTier: "free", limit: 5, locale });
      assert.doesNotMatch(msg, /\$|\d+\s*(usd|mxn)/i);
    }
  }
});

test("an unknown or null plan tier degrades to Free rather than throwing", () => {
  assert.match(seatLimitMessage({ kind: "roster", planTier: null, limit: 5 }), /Free plan limit/);
  assert.match(seatLimitMessage({ kind: "roster", planTier: "nonsense", limit: 5 }), /Free plan limit/);
});
