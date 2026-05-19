/**
 * action-guards.security.test.ts — SECURITY characterization of the
 * authentication/authorization guards in src/lib/server/action-guards.ts.
 *
 * In mission scope explicitly for requireTalent; the sibling guards
 * (requireSession / requireStaff / requireAdmin / requireClient / requireOwner)
 * are characterized too because they share the GuardOk|GuardFail contract that
 * every server action depends on for fail-closed early-return.
 *
 * Technique (repo convention, Node 20 — no module mocking):
 *   • requireOwner is PURE (session + ownerUserId in, no I/O) → behavioural.
 *   • The session/identity-coupled guards are pinned via source invariants
 *     (readFileSync + assert.match), the tenant-isolation.test.ts pattern.
 *
 * Does NOT fix anything. Snapshots CURRENT behaviour so a refactor that
 * weakens a guard fails loudly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { requireOwner } from "./action-guards";
import type { GuardedSession } from "./action-guards";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const GUARDS_SRC = readFileSync(join(HERE, "action-guards.ts"), "utf8");

// Mirror the real (non-exported) GuardOk = `{ ok: true } & GuardedSession`
// structurally via the EXPORTED GuardedSession, so requireOwner() accepts it
// without a cast. profile: null is valid (AccessProfileWithDisplayName | null).
type OkSession = { ok: true } & GuardedSession;

function fakeOkSession(userId: string): OkSession {
  return {
    ok: true,
    supabase: {} as unknown as SupabaseClient,
    user: { id: userId } as unknown as User,
    profile: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// requireOwner — explicit app-layer ownership check (RLS stays authoritative).
// Pure: the security boundary is `session.user.id === ownerUserId`.
// ─────────────────────────────────────────────────────────────────────────────

test("requireOwner: matching user id passes through the SAME session object (callers keep .supabase/.user)", () => {
  const session = fakeOkSession("user-1");
  const out = requireOwner(session, "user-1");
  assert.equal(out.ok, true);
  assert.equal(out, session, "success is an identity passthrough — no copy, no mutation");
});

test("requireOwner: a different user id is denied with a generic 'Not authorized.' (no info leak)", () => {
  const out = requireOwner(fakeOkSession("user-1"), "user-2");
  assert.deepEqual(out, { ok: false, error: "Not authorized." });
});

test("requireOwner: empty / missing owner id never matches a real user id (fail closed)", () => {
  assert.deepEqual(requireOwner(fakeOkSession("user-1"), ""), {
    ok: false,
    error: "Not authorized.",
  });
});

test("requireOwner: comparison is EXACT (case-sensitive, no normalisation) — UUIDs must match byte-for-byte", () => {
  // A near-miss / different-case id must be rejected. Pinning strict ===
  // prevents a future 'helpful' .toLowerCase()/trim() from widening ownership.
  assert.deepEqual(requireOwner(fakeOkSession("AbC-123"), "abc-123"), {
    ok: false,
    error: "Not authorized.",
  });
  assert.deepEqual(requireOwner(fakeOkSession("user-1 "), "user-1"), {
    ok: false,
    error: "Not authorized.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source-level invariants — requireSession / requireStaff / requireAdmin /
// requireTalent / requireClient. Coupled to getCachedActorSession() /
// resolveDashboardIdentity(); pinned structurally.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT: every guard returns the {ok:false,error}|{ok:true} contract — guards never throw (server actions early-return)", () => {
  const guardBodies = GUARDS_SRC.slice(
    GUARDS_SRC.indexOf("export async function requireSession"),
    GUARDS_SRC.indexOf("export function requireOwner"),
  );
  assert.ok(guardBodies.length > 0, "guard region located");
  assert.doesNotMatch(
    guardBodies,
    /\bthrow\b/,
    "auth guards must not throw — they return {ok:false} so actions can early-return a structured error",
  );
});

test("INVARIANT requireSession: distinguishes 'Not configured.' (no supabase) from 'You must be signed in.' (no user)", () => {
  const fn = GUARDS_SRC.slice(
    GUARDS_SRC.indexOf("export async function requireSession"),
    GUARDS_SRC.indexOf("export async function requireStaff"),
  );
  assert.match(fn, /if \(!session\.supabase \|\| !session\.user\)/);
  assert.match(fn, /if \(!session\.supabase\) \{\s*\n\s*return \{ ok: false, error: "Not configured\." \}/);
  assert.match(fn, /return \{ ok: false, error: "You must be signed in\." \}/);
});

test("INVARIANT requireStaff: a session with NO profile is denied (fail closed), gated on isStaffRole(app_role)", () => {
  const fn = GUARDS_SRC.slice(
    GUARDS_SRC.indexOf("export async function requireStaff"),
    GUARDS_SRC.indexOf("export async function requireAdmin"),
  );
  assert.match(
    fn,
    /if \(!session\.profile \|\| !isStaffRole\(session\.profile\.app_role\)\)/,
    "missing profile OR non-staff role → denied",
  );
  assert.match(fn, /return \{ ok: false, error: "Not authorized\." \}/);
});

test("INVARIANT requireStaff is NOT a tenant guard — it is global app_role only (tenant isolation is requireStaffTenantAction's job)", () => {
  // This is the single most load-bearing boundary fact: passing requireStaff()
  // proves staff-of-the-PLATFORM, not staff-of-a-TENANT. requireStaff must not
  // resolve a tenant; the composition with getTenantScope() lives in
  // admin-scope.ts and is enforced for action files by tenant-isolation.test.ts.
  const fn = GUARDS_SRC.slice(
    GUARDS_SRC.indexOf("export async function requireStaff"),
    GUARDS_SRC.indexOf("export async function requireAdmin"),
  );
  assert.doesNotMatch(fn, /getTenantScope|tenant_id|tenantId/, "requireStaff is deliberately tenant-blind");
});

test("INVARIANT requireAdmin: STRICTLY super_admin (narrower than requireStaff — agency_staff is NOT enough)", () => {
  const fn = GUARDS_SRC.slice(
    GUARDS_SRC.indexOf("export async function requireAdmin"),
    GUARDS_SRC.indexOf("export async function requireTalent"),
  );
  assert.match(
    fn,
    /if \(session\.profile\?\.app_role !== "super_admin"\)/,
    "exact equality to super_admin; undefined profile → denied (fail closed)",
  );
  assert.doesNotMatch(fn, /isStaffRole/, "requireAdmin must NOT widen to the staff-role set");
});

test("INVARIANT requireTalent: impersonation WRITE-BLOCK is applied BEFORE the subjectRole gate", () => {
  const fn = GUARDS_SRC.slice(
    GUARDS_SRC.indexOf("export async function requireTalent"),
    GUARDS_SRC.indexOf("export async function requireClient"),
  );
  assert.ok(fn.length > 0, "requireTalent located");
  assert.match(fn, /resolveDashboardIdentity\(\)/, "uses subject-role identity (supports hybrid/impersonation)");
  assert.match(fn, /if \(!identity\)/);
  assert.match(fn, /return \{ ok: false, error: "You must be signed in\." \}/);
  const writeIdx = fn.indexOf("assertMutationsAllowedWhileImpersonating");
  const roleIdx = fn.indexOf('identity.subjectRole !== "talent"');
  assert.ok(writeIdx > -1, "impersonation write-policy is enforced");
  assert.ok(roleIdx > -1, "subjectRole must be talent");
  assert.ok(
    writeIdx < roleIdx,
    "the impersonation write-block must precede the role check (a super-admin impersonating a talent stays read-only)",
  );
});

test("INVARIANT requireClient: mirrors requireTalent but gates subjectRole === 'client'", () => {
  const fn = GUARDS_SRC.slice(
    GUARDS_SRC.indexOf("export async function requireClient"),
    GUARDS_SRC.indexOf("export function requireOwner"),
  );
  assert.match(fn, /resolveDashboardIdentity\(\)/);
  assert.match(fn, /assertMutationsAllowedWhileImpersonating\(identity\)/);
  assert.match(fn, /if \(identity\.subjectRole !== "client"\)/);
  assert.match(fn, /return \{ ok: false, error: "Not authorized\." \}/);
});

test("INVARIANT requireOwner: ownership compares session.user.id by strict !== (no coercion / normalisation)", () => {
  const fn = GUARDS_SRC.slice(GUARDS_SRC.indexOf("export function requireOwner"));
  assert.match(
    fn,
    /if \(session\.user\.id !== ownerUserId\)/,
    "strict identity comparison is the boundary; RLS stays authoritative",
  );
});
