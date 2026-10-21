import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { leaveCopy, leaveOutcomeFromRpc } from "./leave-workspace";

test("the database answer becomes one outcome; any surprise is a failure, never a success", () => {
  assert.equal(leaveOutcomeFromRpc({ data: "left", error: null }), "left");
  assert.equal(leaveOutcomeFromRpc({ data: "not_member", error: null }), "not_member");
  assert.equal(leaveOutcomeFromRpc({ data: null, error: { code: "42501" } }), "forbidden");
  for (const code of ["PGRST202", "42883", "42P01", "PGRST205"]) assert.equal(leaveOutcomeFromRpc({ data: null, error: { code } }), "unavailable", code);
  assert.equal(leaveOutcomeFromRpc({ data: null, error: { code: "XX000" } }), "failed");
  for (const data of [null, undefined, "", "LEFT", true, 1, {}]) assert.equal(leaveOutcomeFromRpc({ data, error: null }), "failed");
});

test("every outcome has a plain ES and EN sentence, no codes and no em dash", () => {
  for (const l of ["es", "en"]) {
    const c = leaveCopy(l);
    for (const k of ["left", "not_member", "forbidden", "unavailable", "failed"] as const) {
      assert.ok(c[k].length > 0, `${l}/${k}`);
      assert.doesNotMatch(c[k], /[—–_]|42501|PGRST/);
    }
    assert.doesNotMatch(c.confirmTitle("X") + c.confirmBody, /[—–]/);
  }
});

const root = join(process.cwd(), "..");
const sql = readFileSync(join(root, "supabase", "migrations", "_pending_pm", "20261231422400_leave_workspace_tul1469.sql"), "utf8");

test("the held function: own profile only, roster removed, listings hidden, terms revoked, jobs untouched, rollback present", () => {
  assert.match(sql, /NOT public\.is_own_talent_profile\(p_talent_profile_id\)[\s\S]*ERRCODE = '42501'/);
  assert.match(sql, /SET status = 'removed'/);
  assert.match(sql, /SET status = ''hidden''/);
  assert.match(sql, /SET status = ''revoked''/);
  assert.match(sql, /talent_exclusive_workspace/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /\b(bookings|orders|booking_talent|inquiries|projects)\b/i, "does not touch jobs");
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.leave_workspace_as_talent\(uuid, uuid\) FROM PUBLIC, anon/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.leave_workspace_as_talent/);
  assert.match(sql, /to_regclass\('public\.workspace_service_listings'\)/);
});

test("the action runs as the signed-in talent (user session, no service role) and is impersonation-guarded", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent/leave-workspace-actions.ts"), "utf8");
  assert.match(src, /^"use server";/);
  assert.match(src, /requireNotImpersonating\(\)/);
  assert.doesNotMatch(src, /createServiceRoleClient/);
  assert.match(src, /loadOwnTalentProfileId\(session\.user\.id\)/);
  assert.match(src, /leave_workspace_as_talent/);
});
