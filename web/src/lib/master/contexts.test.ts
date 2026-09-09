import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKSPACE_CONTEXTS, contextSwitchPlan, teamAccess } from "./contexts";

test("seven contexts", () => {
  assert.equal(WORKSPACE_CONTEXTS.length, 7);
});

test("leaving staff clears payments and team views", () => {
  const plan = contextSwitchPlan("operator", "assigned_talent");
  assert.ok(plan.clearViews.includes("payments"));
  assert.ok(plan.clearViews.includes("team"));
  assert.ok(plan.reauthorize.includes("capabilities"));
});

test("roster membership alone grants no Team access", () => {
  assert.equal(
    teamAccess({ context: "assigned_talent", onRoster: true, hasStaffRole: false }),
    false,
  );
  assert.equal(
    teamAccess({ context: "operator", onRoster: true, hasStaffRole: true }),
    true,
  );
});
