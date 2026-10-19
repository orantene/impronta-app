import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePlanIntent, parsePlanIntentInterval, planIntentLabel, planIntentQuery, upgradeHrefFromToday, workspaceAutoStartDecision, workspaceUpgradeHref } from "./plan-intent";

test("parsePlanIntent keeps only paid talent plans", () => {
  assert.deepEqual(parsePlanIntent("talent_pro", "year"), { plan: "talent_pro", interval: "year" });
  assert.deepEqual(parsePlanIntent("talent_portfolio", "month"), { plan: "talent_portfolio", interval: "month" });
  assert.deepEqual(parsePlanIntent("talent_pro", "weekly"), { plan: "talent_pro", interval: "month" });
  assert.deepEqual(parsePlanIntent("talent_pro", undefined), { plan: "talent_pro", interval: "month" });
});

test("BILL-B: parsePlanIntent is tolerant of the modal's old m|y interval", () => {
  assert.deepEqual(parsePlanIntent("talent_portfolio", "y"), { plan: "talent_portfolio", interval: "year" });
  assert.deepEqual(parsePlanIntent("talent_portfolio", "m"), { plan: "talent_portfolio", interval: "month" });
  assert.deepEqual(parsePlanIntent("talent_pro", "y"), { plan: "talent_pro", interval: "year" });
  assert.deepEqual(parsePlanIntent("talent_pro", "Year"), { plan: "talent_pro", interval: "year" });
  for (const [raw, want] of [["y", "year"], ["year", "year"], ["m", "month"], ["month", "month"], ["", "month"], ["yr", "month"], [null, "month"], [7, "month"]] as const) {
    assert.equal(parsePlanIntentInterval(raw), want, String(raw));
  }
});

test("parsePlanIntent ignores free, workspace and junk", () => {
  for (const p of ["talent_basic", "free", "network", "legacy", "", "TALENT_PRO", undefined, null, 5, ["talent_pro"]]) {
    assert.equal(parsePlanIntent(p, "year"), null);
  }
});

test("planIntentQuery", () => {
  assert.equal(planIntentQuery(null), "");
  assert.equal(planIntentQuery({ plan: "talent_pro", interval: "year" }), "plan=talent_pro&interval=year");
});

test("upgradeHrefFromToday swaps the today path and needs an intent", () => {
  const intent = { plan: "talent_portfolio", interval: "month" } as const;
  assert.equal(upgradeHrefFromToday("https://app.tulala.digital/talent/today", intent), "https://app.tulala.digital/talent/plan?plan=talent_portfolio&interval=month");
  assert.equal(upgradeHrefFromToday("https://app.tulala.digital/talent/today", null), null);
  assert.equal(upgradeHrefFromToday("https://x.test/elsewhere", intent), null);
  assert.equal(upgradeHrefFromToday(undefined, intent), null);
});

test("parsePlanIntent keeps purchasable workspace plans, not network", () => {
  assert.deepEqual(parsePlanIntent("agency", "year"), { plan: "agency", interval: "year" });
  assert.deepEqual(parsePlanIntent("studio", undefined), { plan: "studio", interval: "month" });
  assert.deepEqual(parsePlanIntent("website", "month"), { plan: "website", interval: "month" });
  assert.equal(parsePlanIntent("network", "year"), null);
});

test("workspaceUpgradeHref points at the admin billing page for workspace plans only", () => {
  const ws = { plan: "agency", interval: "year" } as const;
  assert.equal(workspaceUpgradeHref("https://app.tulala.digital/acme/admin", ws), "https://app.tulala.digital/acme/admin/account?plan=agency&interval=year");
  assert.equal(workspaceUpgradeHref("https://app.tulala.digital/acme/admin/", ws), "https://app.tulala.digital/acme/admin/account?plan=agency&interval=year");
  assert.equal(workspaceUpgradeHref("https://x.test/acme/admin", { plan: "talent_pro", interval: "month" }), null);
  assert.equal(workspaceUpgradeHref(undefined, ws), null);
  assert.equal(workspaceUpgradeHref("https://x.test/a/admin", null), null);
  assert.equal(upgradeHrefFromToday("https://app.tulala.digital/talent/today", ws), null);
});

test("planIntentLabel", () => {
  assert.equal(planIntentLabel({ plan: "studio", interval: "month" }), "Studio");
  assert.equal(planIntentLabel({ plan: "talent_pro", interval: "month" }), "Pro");
});

test("workspaceAutoStartDecision starts once for a purchasable plan and skips otherwise", () => {
  const base = { plan: "studio", interval: "year", canManageBilling: true, hasActiveSubscription: false, stripeEnabled: true };
  assert.deepEqual(workspaceAutoStartDecision(base), { action: "start", intent: { plan: "studio", interval: "year" } });
  assert.equal(workspaceAutoStartDecision({ ...base, hasActiveSubscription: true }).action, "skip");
  assert.equal(workspaceAutoStartDecision({ ...base, canManageBilling: false }).action, "skip");
  assert.equal(workspaceAutoStartDecision({ ...base, stripeEnabled: false }).action, "skip");
  assert.equal(workspaceAutoStartDecision({ ...base, plan: "network" }).action, "skip");
  assert.equal(workspaceAutoStartDecision({ ...base, plan: "talent_pro" }).action, "skip");
  assert.equal(workspaceAutoStartDecision({ ...base, plan: undefined }).action, "skip");
});
