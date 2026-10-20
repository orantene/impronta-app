/**
 * TUL-1359 code-first: staff talent lookups use the service client after
 * authorization, so narrowing the talent_profiles SELECT policy to roster
 * membership does not blank applicants or write NULL user_ids / empty snapshots.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/talent/staff-talent-lookup.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildAgencyApplicationRows } from "./apply-loaders";
import { lookupTalentSnapshot, lookupTalentUserId } from "./staff-talent-lookup";

type Row = Record<string, unknown>;

function fake(tables: Record<string, Row[]>) {
  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
      in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
      order: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows, error: null }),
    };
    return q;
  }
  return { from: (t: string) => query(t) } as never;
}

const TENANT = "t1";
const APPLICANT = "tp-applicant";
const APPS = {
  talent_agency_applications: [
    { id: "a1", tenant_id: TENANT, talent_profile_id: APPLICANT, status: "pending", message: "hi", decision_note: null, submitted_at: "2026-10-01T00:00:00Z", decided_at: null },
  ],
  talent_hub_applications: [] as Row[],
};
// An unpublished applicant who is NOT on the roster: invisible to the staff session once RLS is roster-scoped.
const SESSION = fake({ ...APPS, talent_profiles: [] });
const SERVICE = fake({ talent_profiles: [{ id: APPLICANT, display_name: "Ana Applicant", profile_code: "TAL-777", user_id: "u1" }] });

test("an unpublished, off-roster applicant still shows name and code in the applications list", async () => {
  const rows = await buildAgencyApplicationRows(SESSION, SERVICE, TENANT);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].talentDisplayName, "Ana Applicant");
  assert.equal(rows[0].talentProfileCode, "TAL-777");
});

test("the applications themselves stay tenant-scoped on the session client", async () => {
  const other = fake({
    talent_agency_applications: [{ ...APPS.talent_agency_applications[0], tenant_id: "other-tenant" }],
    talent_hub_applications: [],
    talent_profiles: [],
  });
  assert.deepEqual(await buildAgencyApplicationRows(other, SERVICE, TENANT), []);
});

test("user_id write path: the service client resolves the claimed account the session cannot see", async () => {
  const viaSession = await lookupTalentUserId(SESSION, APPLICANT);
  assert.deepEqual(viaSession, { found: false }, "a filtered read is reported, never read as 'no account'");
  const viaService = await lookupTalentUserId(SERVICE, APPLICANT);
  assert.deepEqual(viaService, { found: true, userId: "u1" });
});

test("an unclaimed talent is found with a null user_id; a missing one is not found", async () => {
  const svc = fake({ talent_profiles: [{ id: "tp-unclaimed", display_name: "U", profile_code: "TAL-1", user_id: null }] });
  assert.deepEqual(await lookupTalentUserId(svc, "tp-unclaimed"), { found: true, userId: null });
  assert.deepEqual(await lookupTalentUserId(svc, "tp-missing"), { found: false });
});

test("name snapshots: a filtered read is not found, so no empty snapshot is ever written", async () => {
  assert.deepEqual(await lookupTalentSnapshot(SESSION, APPLICANT), { found: false });
  assert.deepEqual(await lookupTalentSnapshot(SERVICE, APPLICANT), { found: true, displayName: "Ana Applicant", profileCode: "TAL-777" });
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("every staff talent lookup site uses the service client and refuses a missing row", () => {
  const roster = read("src/lib/inquiry/inquiry-engine-roster.ts");
  assert.equal((roster.match(/lookupTalentUserId\(await staffTalentClient\(supabase\)/g) ?? []).length, 2, "addTalentToRoster + swapTalent");
  assert.doesNotMatch(roster, /from\("talent_profiles"\)\s*\.select\("user_id"\)/);
  const alt = read("src/lib/inquiry/inquiry-engine-alternates.ts");
  assert.match(alt, /lookupTalentUserId\(await staffTalentClient\(supabase\), alt\.talent_profile_id\)/);
  assert.doesNotMatch(alt, /from\("talent_profiles"\)\s*\.select\("user_id"\)/);
  const offers = read("src/lib/inquiry/inquiry-engine-offers.ts");
  assert.match(offers, /lookupTalentUserId\(await staffTalentClient\(supabase\), talentProfileId\)/);
  assert.match(offers, /\(await staffTalentClient\(supabase\)\)\s*\.from\("talent_profiles"\)\s*\.select\("id, booking_terms"\)/);
  const submit = read("src/lib/inquiry/inquiry-engine-submit.ts");
  assert.match(submit, /\(await staffTalentClient\(supabase\)\)\s*\.from\("talent_profiles"\)\s*\.select\("id, user_id"\)/);
  assert.match(submit, /talent_not_found/);
  for (const f of ["src/lib/server-actions/admin-inquiries.ts", "src/lib/server-actions/admin-bookings.ts"]) {
    const src = read(f);
    assert.match(src, /lookupTalentSnapshot\(await staffTalentClient\(supabase\)/);
    assert.doesNotMatch(src, /\.select\("display_name, profile_code"\)/, `${f} reads the snapshot via the helper`);
  }
  assert.equal((read("src/lib/server-actions/admin-bookings.ts").match(/lookupTalentSnapshot\(await staffTalentClient/g) ?? []).length, 2);
});
