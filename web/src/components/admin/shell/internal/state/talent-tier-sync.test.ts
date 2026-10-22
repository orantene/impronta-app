import assert from "node:assert/strict";
import { test } from "node:test";

import { talentPlanToTier } from "../../../../../lib/access/talent-membership";
import { nextTalentTier } from "./talent-tier-sync";

test("adopts the paid tier when the server value changes after an upgrade", () => {
  assert.equal(nextTalentTier("free", "free", "max"), "max");
});

test("a trialing talent_portfolio plan key resolves to the paid tier the label reads", () => {
  // membership_tier ('free') is never an input; the plan key is the source.
  assert.equal(talentPlanToTier("talent_portfolio"), "max");
  assert.equal(nextTalentTier("free", "free", talentPlanToTier("talent_portfolio")), "max");
});

test("an unchanged server value never overrides a local value (dev switcher)", () => {
  assert.equal(nextTalentTier("pro", "free", "free"), "pro");
});

test("prototype mode (no server value) keeps the current tier", () => {
  assert.equal(nextTalentTier("pro", null, null), "pro");
});

test("downgrade is adopted too", () => {
  assert.equal(nextTalentTier("max", "max", "free"), "free");
});
