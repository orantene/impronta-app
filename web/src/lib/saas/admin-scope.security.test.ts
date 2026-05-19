/**
 * admin-scope.security.test.ts — SECURITY characterization of the admin/talent
 * action guards and cross-tenant resolution helpers in
 * src/lib/saas/admin-scope.ts.
 *
 * Companion to admin-scope.test.ts (which covers only assertRowBelongsToTenant
 * happy paths). This file snapshots the authz behaviour of:
 *   • resolveInquiryTenantForParticipant — the cross-tenant ESCALATION guard
 *     for talent/client callers (fully param-injectable, was untested).
 *   • assertRowBelongsToTenant — confidentiality edges (no existence oracle).
 *   • requireStaffTenantAction / requireTalentSelfAction / requireAdminTenantGuard*
 *     — source-level invariants (header/cookie/session-coupled; not unit-testable
 *     on Node 20 without experimental module mocks — tenant-isolation.test.ts
 *     pattern).
 *
 * Does NOT fix anything. Weak-isolation cases are `{ skip: "SECURITY FLAG: …" }`
 * and still assert the CURRENT behaviour (characterization, not aspiration).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertRowBelongsToTenant,
  resolveInquiryTenantForParticipant,
} from "./admin-scope";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ADMIN_SCOPE_SRC = readFileSync(join(HERE, "admin-scope.ts"), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Mock supabase — per-table results + recorded .eq() filters. Each .from(table)
// resolves that table's configured row via .maybeSingle().
// ─────────────────────────────────────────────────────────────────────────────
type TableResult = { data: unknown };
type FromCall = { table: string; eqs: Array<[string, unknown]> };

function mockSupabaseByTable(byTable: Record<string, TableResult>) {
  const calls: FromCall[] = [];
  const supabase = {
    from(table: string) {
      const call: FromCall = { table, eqs: [] };
      calls.push(call);
      const chain = {
        select() {
          return chain;
        },
        eq(col: string, val: unknown) {
          call.eqs.push([col, val]);
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(byTable[table] ?? { data: null });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveInquiryTenantForParticipant — talent/client callers don't carry an
// agency tenant scope. This helper binds the *inquiry's own* tenant_id, NEVER a
// caller-supplied one. It is the structural defence against a talent/client
// signed into tenant A escalating onto a tenant-B inquiry.
// ─────────────────────────────────────────────────────────────────────────────

test("resolveInquiryTenantForParticipant: takes NO tenant parameter — tenant binding is the row's, never the caller's", () => {
  // Structural anti-escalation property: there is no way to pass a tenant in.
  assert.equal(
    resolveInquiryTenantForParticipant.length,
    4,
    "signature is (supabase, userId, inquiryId, role) — no tenant arg by design",
  );
});

test("resolveInquiryTenantForParticipant(talent): binds the participant ROW's tenant_id, scoped by inquiry+profile+role", async () => {
  const { supabase, calls } = mockSupabaseByTable({
    talent_profiles: { data: { id: "tp-1" } },
    inquiry_participants: { data: { id: "p-1", tenant_id: "tenant-B", status: "active" } },
  });
  const tid = await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent");
  assert.equal(tid, "tenant-B", "tenant comes from the participant row, not the caller's host");
  // Pin the exact authorization filters.
  assert.deepEqual(calls[0], { table: "talent_profiles", eqs: [["user_id", "user-X"]] });
  assert.deepEqual(calls[1], {
    table: "inquiry_participants",
    eqs: [
      ["inquiry_id", "inq-9"],
      ["talent_profile_id", "tp-1"],
      ["role", "talent"],
    ],
  });
});

test("resolveInquiryTenantForParticipant(talent): a user with NO talent_profile cannot resolve any inquiry", async () => {
  const { supabase, calls } = mockSupabaseByTable({
    talent_profiles: { data: null },
    inquiry_participants: { data: { id: "p-1", tenant_id: "tenant-B", status: "active" } },
  });
  const tid = await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent");
  assert.equal(tid, null);
  assert.equal(calls.length, 1, "must NOT query inquiry_participants when no talent_profile");
});

test("resolveInquiryTenantForParticipant(talent): a non-participant gets null (no inquiry-existence oracle)", async () => {
  const { supabase } = mockSupabaseByTable({
    talent_profiles: { data: { id: "tp-1" } },
    inquiry_participants: { data: null },
  });
  assert.equal(
    await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent"),
    null,
  );
});

test("resolveInquiryTenantForParticipant(talent): declined / removed participant is denied (revoked access)", async () => {
  for (const status of ["declined", "removed"]) {
    const { supabase } = mockSupabaseByTable({
      talent_profiles: { data: { id: "tp-1" } },
      inquiry_participants: { data: { id: "p-1", tenant_id: "tenant-B", status } },
    });
    assert.equal(
      await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent"),
      null,
      `status="${status}" must be denied`,
    );
  }
});

test("resolveInquiryTenantForParticipant(talent): participant row with null tenant_id resolves to null (not undefined)", async () => {
  const { supabase } = mockSupabaseByTable({
    talent_profiles: { data: { id: "tp-1" } },
    inquiry_participants: { data: { id: "p-1", tenant_id: null, status: "active" } },
  });
  assert.equal(
    await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent"),
    null,
  );
});

test("resolveInquiryTenantForParticipant(client): binds inquiry tenant ONLY when client_user_id === caller (cross-client isolation)", async () => {
  const { supabase, calls } = mockSupabaseByTable({
    inquiries: { data: { tenant_id: "tenant-C", client_user_id: "user-OWNER" } },
  });
  const tid = await resolveInquiryTenantForParticipant(supabase, "user-OWNER", "inq-77", "client");
  assert.equal(tid, "tenant-C");
  assert.deepEqual(calls[0], {
    table: "inquiries",
    eqs: [
      ["id", "inq-77"],
      ["client_user_id", "user-OWNER"],
    ],
  });
});

test("resolveInquiryTenantForParticipant(client): an inquiry the caller does NOT own → null", async () => {
  // Supabase returns no row because the client_user_id filter excludes it —
  // exactly the cross-client denial path.
  const { supabase } = mockSupabaseByTable({ inquiries: { data: null } });
  assert.equal(
    await resolveInquiryTenantForParticipant(supabase, "user-INTRUDER", "inq-77", "client"),
    null,
  );
});

test("resolveInquiryTenantForParticipant: empty userId / inquiryId short-circuits before any DB hit", async () => {
  const { supabase, calls } = mockSupabaseByTable({
    talent_profiles: { data: { id: "tp-1" } },
    inquiries: { data: { tenant_id: "t", client_user_id: "u" } },
  });
  assert.equal(await resolveInquiryTenantForParticipant(supabase, "", "inq-1", "talent"), null);
  assert.equal(await resolveInquiryTenantForParticipant(supabase, "u", "", "client"), null);
  assert.equal(calls.length, 0, "no DB query when identifiers are empty");
});

test(
  "resolveInquiryTenantForParticipant(talent): an INVITED / PENDING (not-yet-accepted) participant still resolves the tenant",
  {
    skip:
      "SECURITY FLAG: the doc comment says this verifies an 'accepted " +
      "(non-declined/removed) participant', but the gate only rejects status " +
      "'declined' and 'removed'. A talent whose participant row is 'invited', " +
      "'pending', '', or null is treated as authorised and gets the inquiry's " +
      "tenant scope — enabling participant-scoped actions before the talent has " +
      "accepted. Whether that is exploitable depends on downstream action " +
      "checks, but the guard is weaker than its name/contract implies. " +
      "Hardened behaviour: allow-list the accepted states explicitly instead of " +
      "deny-listing only declined/removed.",
  },
  async () => {
    // Characterizes CURRENT (weak) behaviour: 'invited' is NOT denied.
    const { supabase } = mockSupabaseByTable({
      talent_profiles: { data: { id: "tp-1" } },
      inquiry_participants: { data: { id: "p-1", tenant_id: "tenant-B", status: "invited" } },
    });
    const tid = await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent");
    assert.equal(tid, "tenant-B", "current behaviour: invited participant resolves");
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// assertRowBelongsToTenant — pre-flight existence check before delegating an
// opaque row id to tenant-blind engines. Must NOT be an existence oracle.
// ─────────────────────────────────────────────────────────────────────────────

function mockSingle(result: { data: unknown }) {
  const calls: Array<{ table: string; eqs: Array<[string, string]> }> = [];
  const supabase = {
    from(table: string) {
      const call = { table, eqs: [] as Array<[string, string]> };
      calls.push(call);
      const chain = {
        select() {
          return chain;
        },
        eq(c: string, v: string) {
          call.eqs.push([c, v]);
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(result);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

test("assertRowBelongsToTenant: returns false IDENTICALLY for not-found vs wrong-tenant (no existence oracle)", async () => {
  // The action layer must not be able to distinguish "row id is bogus" from
  // "row exists but belongs to another tenant" — both are `false`.
  const notFound = mockSingle({ data: null });
  const wrongTenant = mockSingle({ data: null }); // RLS/tenant filter excludes the real row
  const a = await assertRowBelongsToTenant(notFound.supabase, "inquiries", "does-not-exist", "tenant-1");
  const b = await assertRowBelongsToTenant(wrongTenant.supabase, "inquiries", "real-but-other-tenant", "tenant-1");
  assert.equal(a, false);
  assert.equal(b, false);
  assert.equal(a, b, "denial is indistinguishable across the two cases");
});

test("assertRowBelongsToTenant: always filters by BOTH id AND tenant_id (defence-in-depth over RLS)", async () => {
  const { supabase, calls } = mockSingle({ data: { id: "r" } });
  await assertRowBelongsToTenant(supabase, "agency_bookings", "r", "tenant-9");
  assert.deepEqual(calls[0].eqs, [
    ["id", "r"],
    ["tenant_id", "tenant-9"],
  ]);
});

test(
  "assertRowBelongsToTenant: a whitespace-only rowId/tenantId does NOT short-circuit (falsy check is `!value`, not trimmed)",
  {
    skip:
      "SECURITY FLAG (low severity / fails-closed): the guard short-circuits " +
      "only on empty-string/falsy id (`if (!rowId || !tenantId)`). A " +
      "whitespace-only \"  \" id is truthy, so the helper still issues a DB " +
      "query with a junk filter. It returns false (no row matches \"  \"), so " +
      "this is not an isolation breach today — but the input is not normalised " +
      "and a future caller that .trim()s elsewhere could diverge. Hardened: " +
      "treat blank-after-trim as empty and short-circuit.",
  },
  async () => {
    // CURRENT behaviour: whitespace id is NOT short-circuited → DB is queried.
    const { supabase, calls } = mockSingle({ data: null });
    const ok = await assertRowBelongsToTenant(supabase, "inquiries", "   ", "tenant-1");
    assert.equal(ok, false, "fails closed (junk filter matches no row)");
    assert.equal(calls.length, 1, "current behaviour: it DID hit the DB on whitespace input");
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Source-level guard invariants — requireStaffTenantAction / requireTalentSelfAction
// / requireAdminTenantGuard*. Coupled to getTenantScope()+session; pinned
// structurally.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT requireStaffTenantAction: requires BOTH staff auth AND a resolved tenant; never throws (returns {ok:false})", () => {
  const fn = ADMIN_SCOPE_SRC.slice(
    ADMIN_SCOPE_SRC.indexOf("export async function requireStaffTenantAction"),
    ADMIN_SCOPE_SRC.indexOf("export type TalentSelfActionGuard"),
  );
  assert.ok(fn.length > 0, "requireStaffTenantAction located");
  assert.match(fn, /Promise\.all\(\[requireStaff\(\), getTenantScope\(\)\]\)/, "auth AND scope are both required");
  assert.match(fn, /if \(!auth\.ok\) return \{ ok: false/, "staff failure → {ok:false} (no throw)");
  assert.match(fn, /if \(!scope\) \{\s*\n\s*return \{ ok: false/, "missing tenant → {ok:false} (no throw, no default tenant)");
  assert.match(fn, /tenantId: scope\.tenantId/, "tenantId comes from the resolved scope");
  assert.match(fn, /tenantSlug: scope\.membership\.slug/, "tenantSlug comes from membership, never caller input");
});

test("INVARIANT requireStaffTenantAction: takes no parameters — a tenant cannot be supplied by the caller", () => {
  assert.match(
    ADMIN_SCOPE_SRC,
    /export async function requireStaffTenantAction\(\):/,
    "zero-arg signature — structural anti-escalation",
  );
});

test("INVARIANT requireTalentSelfAction: OWNERSHIP (user_id) is the boundary — NOT app_role; no requireTalent() pre-gate", () => {
  const fn = ADMIN_SCOPE_SRC.slice(
    ADMIN_SCOPE_SRC.indexOf("export async function requireTalentSelfAction"),
    ADMIN_SCOPE_SRC.indexOf("export async function assertRowBelongsToTenant"),
  );
  assert.ok(fn.length > 0, "requireTalentSelfAction located");
  // The dual-eq ownership query is the security boundary.
  assert.match(fn, /\.from\("talent_profiles"\)/);
  assert.match(fn, /\.eq\("id", talent_profile_id\)/);
  assert.match(fn, /\.eq\("user_id", user\.id\)/, "ownership: profile.user_id must equal the signed-in user");
  assert.match(fn, /return \{ ok: false, error: "Not your profile\." \}/);
  // Still requires a signed-in user AND a resolved tenant scope.
  assert.match(fn, /if \(!scope\) return \{ ok: false/, "no tenant scope → refuse");
  assert.match(fn, /if \(userErr \|\| !user\) return \{ ok: false/, "must be signed in");
  // The documented hybrid-user fix: it must NOT pre-gate on requireTalent()/role.
  assert.doesNotMatch(fn, /requireTalent\(\)/, "must not role-gate (hybrid admin-as-talent owns their profile)");
});

test("INVARIANT requireAdminTenantGuard*: both variants refuse on null scope (redirect vs throw) — no seed fallback", () => {
  const guard = ADMIN_SCOPE_SRC.slice(
    ADMIN_SCOPE_SRC.indexOf("export async function requireAdminTenantGuard"),
    ADMIN_SCOPE_SRC.indexOf("export async function requireStaffTenantAction"),
  );
  assert.ok(guard.length > 0, "requireAdminTenantGuard* located");
  // redirecting variant
  assert.match(guard, /if \(!scope\) \{\s*\n\s*redirect\(/, "requireAdminTenantGuard redirects when scope is null");
  // throwing variant
  assert.match(
    guard,
    /throw new Error\("no tenant scope resolved for this admin request"\)/,
    "requireAdminTenantGuardOrThrow throws when scope is null",
  );
  assert.doesNotMatch(guard, /LEGACY_TENANT_ID|00000000-0000-0000-0000-0000000000/, "no seed-tenant fallback");
});
