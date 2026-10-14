import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePlanIntent, planIntentQuery, upgradeHrefFromToday } from "./plan-intent";

test("parsePlanIntent keeps only paid talent plans", () => {
  assert.deepEqual(parsePlanIntent("talent_pro", "year"), { plan: "talent_pro", interval: "year" });
  assert.deepEqual(parsePlanIntent("talent_portfolio", "month"), { plan: "talent_portfolio", interval: "month" });
  assert.deepEqual(parsePlanIntent("talent_pro", "weekly"), { plan: "talent_pro", interval: "month" });
  assert.deepEqual(parsePlanIntent("talent_pro", undefined), { plan: "talent_pro", interval: "month" });
});

test("parsePlanIntent ignores free, workspace and junk", () => {
  for (const p of ["talent_basic", "free", "agency", "network", "", "TALENT_PRO", undefined, null, 5, ["talent_pro"]]) {
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
