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
  for (const data of ["not_allowed_hub", "not_allowed_home", "not_allowed_primary"]) assert.equal(leaveOutcomeFromRpc({ data, error: null }), "not_allowed", data);
  assert.equal(leaveOutcomeFromRpc({ data: "not_allowed_other", error: null }), "failed");
  assert.equal(leaveOutcomeFromRpc({ data: null, error: { code: "XX000" } }), "failed");
  for (const data of [null, undefined, "", "LEFT", true, 1, {}]) assert.equal(leaveOutcomeFromRpc({ data, error: null }), "failed");
});

test("every outcome has a plain ES and EN sentence, no codes and no em dash", () => {
  for (const l of ["es", "en"]) {
    const c = leaveCopy(l);
    for (const k of ["left", "not_member", "forbidden", "not_allowed", "unavailable", "failed"] as const) {
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

test("the held function refuses hub, home and primary (fail closed) and still cleans up after a removal", () => {
  const code = sql.replace(/--.*$/gm, "");
  assert.match(code, /a\.kind = 'hub'|v_kind = 'hub'/);
  assert.match(code, /RETURN 'not_allowed_hub'/);
  assert.match(code, /tp\.created_by_agency_id = p_tenant_id[\s\S]*RETURN 'not_allowed_home'/);
  assert.match(code, /v_is_primary THEN\s+RETURN 'not_allowed_primary'/);
  // refusals happen before any write
  assert.ok(code.indexOf("not_allowed_primary") < code.indexOf("SET status = 'removed'"));
  assert.ok(code.indexOf("not_allowed_hub") < code.indexOf("SET status = 'removed'"));
  // no early not_member: cleanup always runs, 'left' only when something changed
  assert.doesNotMatch(code, /v_roster_id IS NULL THEN\s+RETURN 'not_member'/);
  assert.match(code, /RETURN CASE WHEN v_changed THEN 'left' ELSE 'not_member' END/);
  assert.equal((code.match(/GET DIAGNOSTICS v_n = ROW_COUNT/g) ?? []).length, 3);
});

test("a collective order for a talent who left is refused, never priced without the owner's cut", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/service-hub/collective-split.ts"), "utf8");
  assert.match(src, /removed roster member on a collective order/);
  assert.doesNotMatch(src, /\.neq\("status", "removed"\)/);
});

test("the real MoneyHomePage carries the Where you appear link", () => {
  const src = readFileSync(join(process.cwd(), "src/components/talent/money/MoneyHomePage.tsx"), "utf8");
  assert.match(src, /import \{ WhereYouAppearLink \}/);
  assert.match(src, /<WhereYouAppearLink \/>/);
});
