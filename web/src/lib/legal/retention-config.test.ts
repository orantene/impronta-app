import assert from "node:assert/strict";
import { test } from "node:test";

import { RETENTION_PERIODS, isRetentionEnforced, retentionMode } from "./retention-config";

test("retention periods match the owner decision", () => {
  assert.equal(RETENTION_PERIODS.messagesAndBookingsYears, 3);
  assert.equal(RETENTION_PERIODS.deletedAccountGraceDays, 14);
  assert.equal(RETENTION_PERIODS.deletedAccountPurgeDaysAfterGrace, 30);
  assert.equal(RETENTION_PERIODS.logsDays, 90);
});

test("retention is a dry run unless RETENTION_ENFORCE is exactly true", () => {
  assert.equal(retentionMode({}), "dry-run");
  for (const v of ["", "1", "TRUE", "yes", "false", " true"]) {
    assert.equal(isRetentionEnforced({ RETENTION_ENFORCE: v }), false, v);
    assert.equal(retentionMode({ RETENTION_ENFORCE: v }), "dry-run", v);
  }
  assert.equal(retentionMode({ RETENTION_ENFORCE: "true" }), "enforce");
});
