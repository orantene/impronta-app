/**
 * platform-take-rate.test.ts
 *
 * Replaces `bookings/commission.fallback.test.ts`, which tested the divergent
 * fee table deleted on 2026-08-30. That file's central assertion was the old
 * "M15" rule: an unrecognised plan tier must resolve to 0 bps, on the theory
 * that undercharging beats overcharging.
 *
 * That rule is inverted here, deliberately. An absent tier now INHERITS the
 * platform default. The old rule was written for a genuinely unknown rate but
 * was applied to a known one, which is precisely how Free ended up exempt from
 * a commission the pricing page has always advertised. `plan_tier_bps` is empty
 * in every migration to date, so under the old rule every tier would have been
 * free; under this one every tier inherits 600 bps, which is what the canonical
 * resolver has always done.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLATFORM_DEFAULT_TAKE_BPS,
  resolvePlanTakeBps,
  type PlanTakeConfig,
} from "@/lib/billing/platform-take-rate";

const cfg = (over: Partial<PlanTakeConfig> = {}): PlanTakeConfig => ({
  default_take_bps: 600,
  plan_tier_bps: {},
  ...over,
});

test("the ratified default matches the migration", () => {
  // 20261007000000_commission_talent_protected_split.sql sets 600.
  assert.equal(PLATFORM_DEFAULT_TAKE_BPS, 600);
});

test("every tier inherits the default when plan_tier_bps is empty", () => {
  const c = cfg();
  for (const tier of ["free", "website", "studio", "agency", "network"]) {
    assert.equal(resolvePlanTakeBps(c, tier), 600, `${tier} should inherit 600`);
  }
});

test("Free is charged exactly like every other tier", () => {
  // The regression this whole module exists to prevent.
  const c = cfg();
  assert.equal(resolvePlanTakeBps(c, "free"), resolvePlanTakeBps(c, "agency"));
  assert.notEqual(resolvePlanTakeBps(c, "free"), 0);
});

test("an explicit per-tier override wins over the default", () => {
  const c = cfg({ plan_tier_bps: { studio: 900 } });
  assert.equal(resolvePlanTakeBps(c, "studio"), 900);
  assert.equal(resolvePlanTakeBps(c, "agency"), 600);
});

test("an explicit zero override is honoured (0 is a valid rate, absence is not)", () => {
  // Distinguishing "configured to 0" from "not configured" is the entire bug.
  const c = cfg({ plan_tier_bps: { free: 0 } });
  assert.equal(resolvePlanTakeBps(c, "free"), 0);
  assert.equal(resolvePlanTakeBps(cfg(), "free"), 600);
});

test("an unrecognised tier inherits rather than resolving to zero", () => {
  const c = cfg();
  assert.equal(resolvePlanTakeBps(c, "enterprise"), 600);
  assert.equal(resolvePlanTakeBps(c, ""), 600);
  assert.equal(resolvePlanTakeBps(c, null), 600);
  assert.equal(resolvePlanTakeBps(c, undefined), 600);
});

test("tier lookup tolerates casing and whitespace from hand-edited rows", () => {
  const c = cfg({ plan_tier_bps: { studio: 900 } });
  assert.equal(resolvePlanTakeBps(c, "  STUDIO "), 900);
});

test("a missing config falls back to the ratified default, never to zero", () => {
  assert.equal(resolvePlanTakeBps(null, "free"), 600);
  assert.equal(resolvePlanTakeBps(undefined, "agency"), 600);
  assert.equal(resolvePlanTakeBps(cfg({ default_take_bps: null }), "studio"), 600);
});

test("junk in the JSONB degrades to the default instead of throwing", () => {
  assert.equal(resolvePlanTakeBps(cfg({ plan_tier_bps: { studio: "nope" } }), "studio"), 600);
  assert.equal(resolvePlanTakeBps(cfg({ plan_tier_bps: { studio: -5 } }), "studio"), 600);
  assert.equal(resolvePlanTakeBps(cfg({ plan_tier_bps: { studio: null } }), "studio"), 600);
  assert.equal(
    resolvePlanTakeBps(cfg({ plan_tier_bps: "not-an-object" as unknown as null }), "studio"),
    600,
  );
});

test("a numeric string override is coerced, since JSONB is untyped", () => {
  assert.equal(resolvePlanTakeBps(cfg({ plan_tier_bps: { studio: "900" } }), "studio"), 900);
});

test("fractional configured values are rounded to whole basis points", () => {
  assert.equal(resolvePlanTakeBps(cfg({ plan_tier_bps: { studio: 612.4 } }), "studio"), 612);
  assert.equal(resolvePlanTakeBps(cfg({ default_take_bps: 599.6 }), "agency"), 600);
});
