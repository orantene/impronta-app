import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isSafeReturnPath, isTrialDoorId, TRIAL_DOOR_IDS, TRIAL_DOORS, trialChargeDate } from "./trial-door";

describe("trial door registry", () => {
  test("every door names one plan and a different fallback", () => {
    for (const id of TRIAL_DOOR_IDS) {
      const def = TRIAL_DOORS[id];
      assert.equal(def.id, id);
      assert.ok(def.plan);
      assert.notEqual(def.fallbackPlan, def.plan);
    }
    assert.ok(isTrialDoorId("custom_domain"));
    assert.ok(!isTrialDoorId("free_lunch"));
    assert.ok(!isTrialDoorId(null));
  });

  test("charge date is trial length from now", () => {
    const now = new Date("2026-09-17T10:00:00Z");
    assert.equal(trialChargeDate(7, now).toISOString(), "2026-09-24T10:00:00.000Z");
    assert.equal(trialChargeDate(0, now).toISOString(), now.toISOString());
    assert.equal(trialChargeDate(-3, now).toISOString(), now.toISOString());
  });
});

describe("return-to-spot path", () => {
  test("accepts a same-origin path inside the workspace", () => {
    assert.ok(isSafeReturnPath("/el-paisa/admin/settings?tab=domain#custom", "el-paisa"));
    assert.ok(isSafeReturnPath("/el-paisa/admin"));
  });

  test("refuses everything that leaves the site or the workspace", () => {
    const bad = [
      "//evil.com/x",
      "/\\evil.com",
      "https://evil.com/el-paisa/admin",
      "/el-paisa/admin" + String.fromCharCode(0),
      "/el-paisa/admin with space",
      "javascript:alert(1)",
      "el-paisa/admin",
      "",
      "/" + "a".repeat(600),
    ];
    for (const p of bad) assert.equal(isSafeReturnPath(p, "el-paisa"), false, JSON.stringify(p));
    assert.equal(isSafeReturnPath("/other-tenant/admin", "el-paisa"), false);
    assert.equal(isSafeReturnPath(42, "el-paisa"), false);
  });
});
