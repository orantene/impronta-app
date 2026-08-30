/**
 * entitlements.test.ts — the pure half of the entitlement read.
 *
 * The loader itself needs a DB and is exercised by `npm run check:price-drift`
 * plus the phase QA script. What is tested here is the selection logic, and in
 * particular the one rule that is counter-intuitive enough to be re-broken by
 * anyone optimising for price: Website is cheaper than Studio, seats nobody, and
 * must therefore lose to Free for any roster at all.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cheapestWorkspacePlanSeating,
  commissionLabel,
  planOption,
  redactForPrompt,
  RECOMMENDABLE_PLANS,
  type TulalaEntitlements,
  type TulalaPlanOption,
} from "@/lib/tulala/entitlements";

const opt = (over: Partial<TulalaPlanOption>): TulalaPlanOption => ({
  family: "workspace",
  planKey: "free",
  dbTierSlug: "free",
  displayName: "Free",
  tagline: null,
  monthlyPriceCents: 0,
  annualPriceCents: 0,
  currency: "USD",
  formattedMonthly: null,
  rosterSeats: 5,
  trialDays: null,
  trialEnabled: false,
  isSelfServe: true,
  isSellableNow: true,
  highlights: [],
  ...over,
});

/** Mirrors the live catalog: Free 5 seats @ $0, Website 0 seats @ $12,
 *  Studio 15 @ $29, Agency unlimited @ $79, Network sales-led. */
const ents = (over: Partial<TulalaEntitlements> = {}): TulalaEntitlements => ({
  commissionBps: 600,
  clientSurchargeBps: 300,
  currency: "USD",
  degraded: false,
  loadedAt: "2026-08-30T00:00:00.000Z",
  workspace: [
    opt({ planKey: "free", displayName: "Free", rosterSeats: 5, monthlyPriceCents: 0 }),
    opt({
      planKey: "website",
      dbTierSlug: "website",
      displayName: "Website",
      rosterSeats: 0,
      monthlyPriceCents: 1200,
      formattedMonthly: "$12",
    }),
    opt({
      planKey: "studio",
      dbTierSlug: "studio",
      displayName: "Studio",
      rosterSeats: 15,
      monthlyPriceCents: 2900,
      formattedMonthly: "$29",
    }),
    opt({
      planKey: "agency",
      dbTierSlug: "agency",
      displayName: "Agency",
      rosterSeats: null,
      monthlyPriceCents: 7900,
      formattedMonthly: "$79",
    }),
    opt({
      planKey: "network",
      dbTierSlug: "hub",
      displayName: "Network",
      rosterSeats: null,
      monthlyPriceCents: null,
      isSelfServe: false,
      isSellableNow: false,
    }),
  ],
  talent: [
    opt({ family: "talent", planKey: "talent_basic", dbTierSlug: "free", displayName: "Basic", rosterSeats: null }),
    opt({
      family: "talent",
      planKey: "talent_pro",
      dbTierSlug: "pro",
      displayName: "Pro",
      rosterSeats: null,
      monthlyPriceCents: 900,
      formattedMonthly: "$9",
    }),
  ],
  ...over,
});

test("a zero-seat plan loses to a cheaper-and-more-capable free plan", () => {
  // The roster disqualifier. Website is $12 and Free is $0, so no price-ordered
  // search can pick Website here, but the point is that it must not even be a
  // candidate: it cannot hold one person.
  const one = cheapestWorkspacePlanSeating(ents(), 1);
  assert.equal(one?.planKey, "free");
  assert.notEqual(one?.planKey, "website");
});

test("Website is never returned for any roster size", () => {
  for (const people of [1, 2, 5, 6, 15, 16, 100]) {
    const pick = cheapestWorkspacePlanSeating(ents(), people);
    assert.notEqual(pick?.planKey, "website", `Website surfaced at ${people} people`);
  }
});

test("Website IS valid when nobody needs seating", () => {
  // A staff-resource-shaped business seats no roster talent, and this is the
  // whole reason the tier exists.
  const pick = cheapestWorkspacePlanSeating(ents(), 0);
  assert.ok(pick);
  assert.ok(
    pick.rosterSeats === 0 || pick.monthlyPriceCents === 0,
    "a zero-roster need should admit Website or Free",
  );
});

test("seat thresholds land on the enforced boundaries, not near them", () => {
  assert.equal(cheapestWorkspacePlanSeating(ents(), 5)?.planKey, "free");
  assert.equal(cheapestWorkspacePlanSeating(ents(), 6)?.planKey, "studio");
  assert.equal(cheapestWorkspacePlanSeating(ents(), 15)?.planKey, "studio");
  assert.equal(cheapestWorkspacePlanSeating(ents(), 16)?.planKey, "agency");
  assert.equal(cheapestWorkspacePlanSeating(ents(), 500)?.planKey, "agency");
});

test("an unsellable plan is not recommended even when it is the only fit", () => {
  // Agency with no Stripe price is a dead end, and Network is sales-led.
  const broken = ents();
  broken.workspace = broken.workspace.map((p) =>
    p.planKey === "agency" ? { ...p, isSellableNow: false } : p,
  );
  assert.equal(cheapestWorkspacePlanSeating(broken, 40), null);
});

test("a sales-led plan is never auto-recommended", () => {
  const pick = cheapestWorkspacePlanSeating(ents(), 40);
  assert.notEqual(pick?.planKey, "network");
});

test("planOption finds across both families", () => {
  const e = ents();
  assert.equal(planOption(e, "studio")?.displayName, "Studio");
  assert.equal(planOption(e, "talent_pro")?.displayName, "Pro");
  assert.equal(planOption(e, "legacy"), null);
});

test("legacy is not recommendable in either family", () => {
  assert.ok(!RECOMMENDABLE_PLANS.workspace.includes("legacy"));
  assert.ok(!RECOMMENDABLE_PLANS.talent.includes("legacy"));
});

test("commission renders compactly", () => {
  assert.equal(commissionLabel(ents()), "6%");
  assert.equal(commissionLabel(ents({ commissionBps: 650 })), "6.5%");
});

test("the prompt payload carries no numbers at all", () => {
  const payload = redactForPrompt(
    opt({ planKey: "studio", displayName: "Studio", monthlyPriceCents: 2900, rosterSeats: 15 }),
  );
  assert.deepEqual(payload, { planKey: "studio", displayName: "Studio", family: "workspace" });
  // Belt and braces: a model must not be able to read a price out of this.
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes("2900"), "price leaked into the prompt payload");
  assert.ok(!serialized.includes("15"), "seat count leaked into the prompt payload");
});
