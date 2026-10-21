/**
 * TUL-1591 (a): when a talent LEAVES a workspace, her old links on that workspace's site
 * go to the group (the workspace's home) instead of a dead page. Only a real former
 * member (roster row `removed`, no active row) is redirected; anyone else, and any
 * doubt, keeps today's real 404. Rule: `leavingOutcome` in hub-rules (#4178): links go
 * to the group while it exists, and on the group's own host it always does.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { LEAVER_REDIRECT_RPC, leaverRedirectPath, talentLeftWorkspace } from "./leaver-redirect";

const WEB = process.cwd();
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

describe("where a leaver's old link goes", () => {
  test("the group's home, in the visitor's locale when the link had one", () => {
    assert.equal(leaverRedirectPath(undefined), "/");
    assert.equal(leaverRedirectPath("es"), "/es");
    assert.equal(leaverRedirectPath("en"), "/en");
  });
  test("anything that is not a two-letter locale is dropped (no open redirect, no path injection)", () => {
    for (const bad of ["", "../x", "//evil.com", "esp", "E", "es/../../x"]) assert.equal(leaverRedirectPath(bad), "/", bad);
  });
});

describe("is this code a former member of this workspace?", () => {
  const client = (reply: { data?: unknown; error?: unknown } | (() => never)) => {
    const calls: Array<{ fn: string; args: unknown }> = [];
    return {
      calls,
      rpc(fn: string, args: unknown) {
        calls.push({ fn, args });
        if (typeof reply === "function") return reply();
        return Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null });
      },
    };
  };
  test("only an explicit true from the database is a yes", async () => {
    const c = client({ data: true });
    assert.equal(await talentLeftWorkspace(c, "t1", "TAL-1"), true);
    assert.deepEqual(c.calls, [{ fn: LEAVER_REDIRECT_RPC, args: { p_tenant_id: "t1", p_profile_code: "TAL-1" } }]);
    for (const data of [false, null, "true", 1, [true]]) assert.equal(await talentLeftWorkspace(client({ data }), "t1", "TAL-1"), false, String(data));
  });
  test("an error, a missing function (migration not applied) or a throw is a no: the 404 stays", async () => {
    assert.equal(await talentLeftWorkspace(client({ error: { code: "PGRST202" } }), "t1", "TAL-1"), false);
    assert.equal(await talentLeftWorkspace(client(() => { throw new Error("down"); }), "t1", "TAL-1"), false);
  });
  test("a blank tenant or code never asks", async () => {
    const c = client({ data: true });
    assert.equal(await talentLeftWorkspace(c, "", "TAL-1"), false);
    assert.equal(await talentLeftWorkspace(c, "t1", "  "), false);
    assert.equal(c.calls.length, 0);
  });
});

describe("wiring", () => {
  test("the edge gate redirects a former member to the group, only after the roster check missed and before the 404", () => {
    const gate = read("src/lib/saas/off-roster-talent-gate.ts");
    const fn = gate.slice(gate.indexOf("export async function offRosterTalentResponse"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    const onRoster = body.indexOf("if (onRoster) return null;");
    const left = body.indexOf("isFormerRosterMemberCode(");
    const notFound = body.indexOf("return pageNotFound(");
    assert.ok(onRoster > 0 && left > onRoster && notFound > left, "roster check, then former-member check, then 404");
    assert.match(body, /NextResponse\.redirect\(new URL\(leaverRedirectPath\(locale\), request\.url\), 307\)/, "a temporary redirect: she may rejoin");
  });
  test("the edge lookup is cached and fails CLOSED to the old 404 (never redirects on doubt)", () => {
    const src = read("src/lib/saas/host-context.ts");
    const fn = src.slice(src.indexOf("export async function isFormerRosterMemberCode"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    assert.match(body, /cacheGet\(/);
    assert.match(body, /cacheSet\(/);
    assert.match(body, /talentLeftWorkspace\(/);
    assert.doesNotMatch(body, /return true; \/\/ fail open/);
  });
  test("the held migration defines the yes/no function for the anon edge client and reveals nothing else", () => {
    const file = path.join(WEB, "../supabase/migrations/_pending_pm/20261231422800_talent_left_workspace_tul1591.sql");
    assert.ok(existsSync(file), "held migration present");
    const sql = readFileSync(file, "utf8");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.talent_left_workspace\(p_tenant_id uuid, p_profile_code text\)/);
    assert.match(sql, /RETURNS boolean/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path = public/);
    assert.match(sql, /r\.status = 'removed'/);
    assert.match(sql, /NOT EXISTS/, "a talent with an active row on this workspace is not a leaver");
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.talent_left_workspace\(uuid, text\) TO anon, authenticated/);
  });
  test("the public hub hides a leaver's listings by her ACTIVE roster row on this workspace", () => {
    const src = read("src/lib/service-hub/public-hub.server.ts");
    assert.match(src, /"agency_talent_roster"/);
    assert.match(src, /\.eq\("status", "active"\)/);
  });
});
