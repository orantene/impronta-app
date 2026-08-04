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
  "resolveInquiryTenantForParticipant(talent): an INVITED participant resolves — INTENTIONAL, aligned to the DB RLS contract `status IN ('invited','active')` [VERIFIED 2026-05-19]",
  async () => {
    // The original SECURITY FLAG suspected 'invited' resolving was the hole.
    // Verified against the system contract instead of the flag's wording: the
    // Supabase RLS policies consistently authorise participants on
    // `status IN ('invited','active')` (supabase/migrations/*phase2_inquiry_
    // participants*, *offer_approval_rls*, *m1_2_inquiry_requirement_groups*).
    // An invited participant was deliberately added to THIS inquiry and is
    // in-scope by design — denying it here would desync this helper from RLS
    // and break legitimate invited-talent flows. So 'invited' STILL resolves;
    // that is correct, not the bug.
    const { supabase } = mockSupabaseByTable({
      talent_profiles: { data: { id: "tp-1" } },
      inquiry_participants: { data: { id: "p-1", tenant_id: "tenant-B", status: "invited" } },
    });
    const tid = await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent");
    assert.equal(tid, "tenant-B", "invited is allow-listed (matches RLS), by design");
  },
);

test(
  "resolveInquiryTenantForParticipant(talent): UNKNOWN / pending / '' / null status now FAILS CLOSED (deny-list → allow-list) [HARDENED 2026-05-19]",
  async () => {
    // The actual hardening: the gate was a deny-list (only declined/removed
    // blocked), so ANY unrecognised state silently fell through and resolved
    // the tenant. It is now an explicit allow-list of {invited, active}; every
    // other / future / malformed status fails closed.
    for (const status of ["pending", "", null, "accepted", "former_coordinator", "weird_future_state"]) {
      const { supabase } = mockSupabaseByTable({
        talent_profiles: { data: { id: "tp-1" } },
        inquiry_participants: { data: { id: "p-1", tenant_id: "tenant-B", status } },
      });
      assert.equal(
        await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent"),
        null,
        `status=${JSON.stringify(status)} is NOT in the {invited,active} allow-list → must deny`,
      );
    }
  },
);

test("resolveInquiryTenantForParticipant(talent): 'active' (the canonical accepted state) still resolves — allow-list regression guard", async () => {
  const { supabase } = mockSupabaseByTable({
    talent_profiles: { data: { id: "tp-1" } },
    inquiry_participants: { data: { id: "p-1", tenant_id: "tenant-B", status: "active" } },
  });
  assert.equal(
    await resolveInquiryTenantForParticipant(supabase, "user-X", "inq-9", "talent"),
    "tenant-B",
  );
});

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
  "assertRowBelongsToTenant: a whitespace-only rowId/tenantId short-circuits before any DB call [HARDENED 2026-05-19]",
  async () => {
    // HARDENING: both arguments are .trim()'d at function entry and the
    // short-circuit runs on the trimmed value. Whitespace-only input never
    // reaches the DB now (no junk-filter query, no perceived "false" oracle).
    for (const [rowId, tenantId] of [
      ["   ", "tenant-1"],
      ["row-1", "   "],
      ["\t\n", "\n\t"],
      ["", "tenant-1"],
      ["row-1", ""],
    ] as const) {
      const { supabase, calls } = mockSingle({ data: { id: "would-match" } });
      const ok = await assertRowBelongsToTenant(supabase, "inquiries", rowId, tenantId);
      assert.equal(
        ok,
        false,
        `inputs (${JSON.stringify(rowId)}, ${JSON.stringify(tenantId)}) must short-circuit to false`,
      );
      assert.equal(
        calls.length,
        0,
        `inputs (${JSON.stringify(rowId)}, ${JSON.stringify(tenantId)}) must not hit the DB`,
      );
    }
  },
);

test("assertRowBelongsToTenant: whitespace-wrapped real ids are trimmed before being used as DB filters", async () => {
  // A legitimate caller that accidentally passes "  row-abc  " should still
  // resolve the real row — but the trimmed value is what hits the DB so the
  // `.eq()` filter doesn't carry stray whitespace into the query string.
  const { supabase, calls } = mockSingle({ data: { id: "row-abc" } });
  const ok = await assertRowBelongsToTenant(
    supabase,
    "inquiries",
    "  row-abc  ",
    "  tenant-T1  ",
  );
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].eqs, [
    ["id", "row-abc"],
    ["tenant_id", "tenant-T1"],
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Source-level guard invariants — requireStaffTenantAction / requireTalentSelfAction
// / requireAdminTenantGuard*. Coupled to getTenantScope()+session; pinned
// structurally.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT requireStaffTenantAction: requires BOTH a session AND a resolved tenant AND a capability; never throws (returns {ok:false})", () => {
  const fn = ADMIN_SCOPE_SRC.slice(
    ADMIN_SCOPE_SRC.indexOf("export async function requireStaffTenantAction"),
    ADMIN_SCOPE_SRC.indexOf("export type TalentSelfActionGuard"),
  );
  assert.ok(fn.length > 0, "requireStaffTenantAction located");
  // 2026-08-04 sweep: the auth leg is `requireSession`, NOT `requireStaff`.
  // `requireStaff` gates the GLOBAL profiles.app_role and therefore rejected
  // hybrid workspace owners (talent/client app_role + owner membership) on
  // their own workspace. Membership is the boundary — proven by getTenantScope
  // (fails closed without an agency_memberships row) plus the capability check.
  assert.match(fn, /Promise\.all\(\[requireSession\(\), getTenantScope\(\)\]\)/, "session AND scope are both required");
  assert.doesNotMatch(fn, /\brequireStaff\s*\(/, "must not re-introduce the global-app_role gate");
  assert.match(fn, /if \(!auth\.ok\) return \{ ok: false/, "session failure → {ok:false} (no throw)");
  assert.match(fn, /if \(!scope\) \{\s*\n\s*return \{ ok: false/, "missing tenant → {ok:false} (no throw, no default tenant)");
  assert.match(
    fn,
    /userHasCapability\(capability, scope\.tenantId\)/,
    "capability is always evaluated against the RESOLVED tenant, never a caller-supplied one",
  );
  assert.match(fn, /tenantId: scope\.tenantId/, "tenantId comes from the resolved scope");
  assert.match(fn, /tenantSlug: scope\.membership\.slug/, "tenantSlug comes from membership, never caller input");
});

test("INVARIANT requireStaffTenantAction: its only parameter is a capability — a tenant cannot be supplied by the caller", () => {
  const sig = ADMIN_SCOPE_SRC.slice(
    ADMIN_SCOPE_SRC.indexOf("export async function requireStaffTenantAction"),
    ADMIN_SCOPE_SRC.indexOf("const capability: CapabilityKey"),
  );
  assert.ok(sig.length > 0, "signature located");
  assert.match(
    sig,
    /requireStaffTenantAction\(options\?: \{\s*\n\s*capability\?: CapabilityKey;\s*\n\s*\}\)/,
    "the ONLY caller-supplied input is a capability to grade UP with",
  );
  assert.doesNotMatch(
    sig,
    /tenantId|tenantSlug|tenant_id/,
    "structural anti-escalation: no tenant identifier may enter through the signature",
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
  // Talent self-edit can run from the canonical /talent app route where no
  // admin workspace cookie exists; after ownership is proven, tenant scope may
  // be resolved from the talent's own active roster row.
  assert.match(fn, /let tenantId = scope\?\.tenantId \?\? null/, "uses active tenant when present");
  assert.match(fn, /\.from\("agency_talent_roster"\)/, "falls back through the owned profile's roster row");
  assert.match(fn, /\.eq\("talent_profile_id", talent_profile_id\)/, "roster fallback is scoped to the owned profile");
  assert.match(fn, /\.eq\("status", "active"\)/, "roster fallback only accepts active roster rows");
  assert.match(fn, /Talent is not on any active roster\./, "orphan profiles are refused");
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
