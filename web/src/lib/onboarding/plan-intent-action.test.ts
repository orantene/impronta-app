import { test } from "node:test";
import assert from "node:assert/strict";
import { planIntentAction } from "./plan-intent";
import { upgradeOutcome } from "../billing/upgrade-outcome";

const studioYear = { plan: "studio", interval: "year" } as const;

test("no subscription -> checkout", () => {
  assert.equal(planIntentAction({ hasSubscription: false, currentPlan: "free", currentInterval: null, intent: studioYear }), "checkout");
});

test("live subscription on another plan -> plan_change", () => {
  assert.equal(planIntentAction({ hasSubscription: true, currentPlan: "website", currentInterval: "month", intent: studioYear }), "plan_change");
});

test("same plan, other interval -> plan_change", () => {
  assert.equal(planIntentAction({ hasSubscription: true, currentPlan: "studio", currentInterval: "month", intent: studioYear }), "plan_change");
});

test("same plan and interval -> none", () => {
  assert.equal(planIntentAction({ hasSubscription: true, currentPlan: "studio", currentInterval: "year", intent: studioYear }), "none");
});

test("same plan, unknown interval -> plan_change (server answers noop)", () => {
  assert.equal(planIntentAction({ hasSubscription: true, currentPlan: "studio", currentInterval: null, intent: studioYear }), "plan_change");
});

test("no intent -> none", () => {
  assert.equal(planIntentAction({ hasSubscription: true, currentPlan: "studio", currentInterval: "year", intent: null }), "none");
});

test("upgradeOutcome maps a planChange answer to plan_change", () => {
  const out = upgradeOutcome({ ok: true, redirectUrl: "/x", planChange: { planKey: "talent_pro", interval: "year" } });
  assert.deepEqual(out, { kind: "plan_change", target: { planKey: "talent_pro", interval: "year" } });
});
