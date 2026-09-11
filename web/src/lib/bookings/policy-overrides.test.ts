import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { depositCentsFromBps, writePolicyOverride } from "./policy-overrides";

test("deposit bps is floor of total", () => {
  assert.equal(depositCentsFromBps(10000, 2500), 2500);
  assert.equal(depositCentsFromBps(999, 2500), 249);
  assert.equal(depositCentsFromBps(10000, null), null);
});

test("an out-of-range override is invalid", async () => {
  const result = await writePolicyOverride(
    { from: () => ({}) },
    { tenantId: "t1", offeringId: "off-1", depositBps: 10001 },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid");
});

test("policy and approval tables live in the same migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231215000_booking_policy_approvals.sql"),
    "utf8",
  );
  assert.match(sql, /booking_policy_overrides/);
  assert.match(sql, /role_limits/);
  assert.match(sql, /approval_requests/);
  assert.match(sql, /request_approval/);
  assert.match(sql, /decide_approval/);
});
