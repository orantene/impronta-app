import test from "node:test";
import assert from "node:assert/strict";
import { canEnableParentCategoryForPlan } from "./tenant-taxonomy-plan-limits";

test("free tenant cannot enable a fourth parent category", () => {
  assert.deepEqual(
    canEnableParentCategoryForPlan({
      plan: "free",
      enabledParentCount: 3,
      isAlreadyEnabled: false,
    }),
    { ok: false, error: "Free workspaces can enable 3 talent type groups." },
  );
});

test("already-enabled category can be saved even when tenant is over cap", () => {
  assert.deepEqual(
    canEnableParentCategoryForPlan({
      plan: "free",
      enabledParentCount: 19,
      isAlreadyEnabled: true,
    }),
    { ok: true },
  );
});

test("studio tenant can enable up to eight parent categories", () => {
  assert.deepEqual(
    canEnableParentCategoryForPlan({
      plan: "studio",
      enabledParentCount: 7,
      isAlreadyEnabled: false,
    }),
    { ok: true },
  );
});
