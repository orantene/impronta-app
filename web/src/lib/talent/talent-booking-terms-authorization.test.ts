/**
 * TUL-1735: behavioural authorization tests for the talent booking terms (talent-booking-terms-actions.ts).
 * The decision is `authorizeTalentProfileAccess` (the one seam both writers call) run
 * against an in-memory model of two workspaces. The wiring (the file passes the real
 * `staffMayEditTalent`, no global-role shortcut) is pinned below the behaviour.
 * Run: cd web && npx tsx --test src/lib/talent/talent-booking-terms-authorization.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { authorizeTalentProfileAccess, type TalentAccessDeps } from "@/lib/talent/talent-profile-access";

type Profile = { id: string; user_id: string | null };

// Workspace A rosters talent "tal-a" (owned by user "u-talent-a"); workspace B rosters "tal-b".
const PROFILES: Record<string, Profile> = {
  "tal-a": { id: "tal-a", user_id: "u-talent-a" },
  "tal-b": { id: "tal-b", user_id: "u-talent-b" },
};
const ROSTER: Record<string, ReadonlySet<string>> = { "ws-a": new Set(["tal-a"]), "ws-b": new Set(["tal-b"]) };

type Caller = { userId: string | null; staff?: { tenantId: string; capabilities: readonly string[] } };

/** Mirrors staffMayEditTalent: needs agency.roster.edit in a workspace whose roster has the talent. */
function depsFor(caller: Caller, calls: string[] = []): TalentAccessDeps<Profile> {
  return {
    getUserId: async () => caller.userId,
    loadProfile: async (id) => {
      calls.push(`load:${id}`);
      return { row: PROFILES[id] ?? null, error: null };
    },
    staffMayEdit: async (id) => {
      calls.push(`staff:${id}`);
      const s = caller.staff;
      return !!s && s.capabilities.includes("agency.roster.edit") && (ROSTER[s.tenantId]?.has(id) ?? false);
    },
  };
}

test("signed out: not authenticated, and nothing is read", async () => {
  const calls: string[] = [];
  assert.deepEqual(await authorizeTalentProfileAccess(depsFor({ userId: null }, calls), "tal-a"), { ok: false, error: "Not authenticated." });
  assert.deepEqual(calls, []);
});

test("the talent owner is allowed, and the staff check is never consulted", async () => {
  const calls: string[] = [];
  const res = await authorizeTalentProfileAccess(depsFor({ userId: "u-talent-a" }, calls), "tal-a");
  assert.ok(res.ok);
  assert.equal(res.isOwner, true);
  assert.equal(res.isStaff, false);
  assert.deepEqual(calls, ["load:tal-a"]);
});

test("staff on the talent's roster with agency.roster.edit is allowed", async () => {
  const res = await authorizeTalentProfileAccess(
    depsFor({ userId: "u-staff-a", staff: { tenantId: "ws-a", capabilities: ["agency.roster.edit"] } }),
    "tal-a",
  );
  assert.ok(res.ok);
  assert.equal(res.isStaff, true);
  assert.equal(res.isOwner, false);
});

test("staff of ANOTHER workspace is Forbidden (cross-tenant), even with agency.roster.edit", async () => {
  const res = await authorizeTalentProfileAccess(
    depsFor({ userId: "u-staff-b", staff: { tenantId: "ws-b", capabilities: ["agency.roster.edit"] } }),
    "tal-a",
  );
  assert.deepEqual(res, { ok: false, error: "Forbidden." });
});

test("staff on the roster WITHOUT agency.roster.edit is Forbidden", async () => {
  const res = await authorizeTalentProfileAccess(
    depsFor({ userId: "u-viewer-a", staff: { tenantId: "ws-a", capabilities: ["agency.roster.view"] } }),
    "tal-a",
  );
  assert.deepEqual(res, { ok: false, error: "Forbidden." });
});

test("another talent (not the owner, no staff role) is Forbidden; an unknown profile is not found", async () => {
  assert.deepEqual(await authorizeTalentProfileAccess(depsFor({ userId: "u-talent-b" }), "tal-a"), { ok: false, error: "Forbidden." });
  assert.deepEqual(await authorizeTalentProfileAccess(depsFor({ userId: "u-talent-a" }), "nope"), { ok: false, error: "Profile not found." });
});

test("a failed profile read is reported and refuses (fails closed)", async () => {
  const seen: unknown[] = [];
  const deps: TalentAccessDeps<Profile> = {
    ...depsFor({ userId: "u-talent-a" }),
    loadProfile: async () => ({ row: PROFILES["tal-a"], error: new Error("boom") }),
    onReadError: (e) => seen.push(e),
  };
  assert.deepEqual(await authorizeTalentProfileAccess(deps, "tal-a"), { ok: false, error: "Profile not found." });
  assert.equal(seen.length, 1);
});

test("talent-booking-terms-actions.ts wires the seam to the real roster-gated staff check", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent/talent-booking-terms-actions.ts"), "utf8");
  assert.match(src, /authorizeTalentProfileAccess</);
  assert.match(src, /staffMayEdit: staffMayEditTalent,/);
  assert.doesNotMatch(src, /isStaffRole/);
});
