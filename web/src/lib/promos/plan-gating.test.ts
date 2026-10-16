import { test } from "node:test";
import assert from "node:assert/strict";

import { canGoLive, type PlanGateInput } from "./plan-gating";

const trialPromo: PlanGateInput["promo"] = {
  audience: "public",
  unlock: "auto",
  starts_at: "2026-10-14",
  ends_at: "2026-10-20",
  tz: "America/Mexico_City",
  max_uses: 5,
};

const free = (promo: Partial<PlanGateInput["promo"]> = {}, trialUsed = false) =>
  canGoLive({ plan: "free", trialUsed, promo: { ...trialPromo, ...promo } });

test("paid plan: anything goes", () => {
  assert.deepEqual(canGoLive({ plan: "paid", trialUsed: true, promo: { ...trialPromo, unlock: "code" } }), { allowed: true, reason: "paid_plan" });
});

test("free plan: a 7-day, 5-use public auto promo is the trial", () => {
  assert.deepEqual(free(), { allowed: true, reason: "trial" });
});

test("free plan: the trial is lifetime", () => {
  assert.deepEqual(free({}, true), { allowed: false, reason: "trial_used" });
});

test("free plan: codes, links, personal and audiences need paid", () => {
  assert.equal(free({ unlock: "code" }).reason, "trial_public_auto_only");
  assert.equal(free({ unlock: "link" }).reason, "trial_public_auto_only");
  assert.equal(free({ audience: "new_clients" }).reason, "trial_public_auto_only");
  assert.equal(free({ is_single_use: true }).reason, "trial_public_auto_only");
});

test("free plan: max 7 days, inclusive", () => {
  assert.equal(free({ ends_at: "2026-10-21" }).reason, "trial_too_long");
  assert.equal(free({ ends_at: null }).reason, "trial_needs_dates");
});

test("free plan: max 5 uses, and a limit is required", () => {
  assert.equal(free({ max_uses: 6 }).reason, "trial_needs_use_limit");
  assert.equal(free({ max_uses: null }).reason, "trial_needs_use_limit");
});
