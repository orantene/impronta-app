/**
 * P0 (PR 0b-1): profiles / talent_profiles / client_profiles — no self-promotion,
 * no cross-tenant staff access. Pins the HELD migration text and the app-layer guards.
 *
 * Behaviour was proven on staging (fxlankepwnvelxjrahwk) in a rolled-back transaction:
 * before the fix a studio owner (app_role agency_staff) could UPDATE their own app_role to
 * super_admin and read/update all other profiles; after the migration SQL both are refused
 * and the owner still reads own-tenant roster talents, members and clients.
 *
 * Run: npm run test:wt -- src/lib/saas/profiles-no-self-promotion.static.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "_pending_pm",
  "20261231415400_profiles_no_self_promotion_tenant_scoped_staff.sql",
);
const sql = readFileSync(MIGRATION, "utf8");
const WEB = join(REPO, "web", "src");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

function policyBlock(name: string): string {
  const start = sql.indexOf(`CREATE POLICY ${name} `);
  assert.ok(start >= 0, `policy ${name} must be (re)created`);
  const end = sql.indexOf(";", start);
  return sql.slice(start, end);
}

test("app_role / account_status cannot change from a direct session unless platform admin, staff included", () => {
  assert.match(sql, /CREATE TRIGGER profiles_protect_role_status\s+BEFORE UPDATE ON public\.profiles/);
  const fn = sql.slice(sql.indexOf("FUNCTION public.profiles_protect_role_status"), sql.indexOf("DROP TRIGGER"));
  assert.match(fn, /NEW\.app_role IS DISTINCT FROM OLD\.app_role/);
  assert.match(fn, /NEW\.account_status IS DISTINCT FROM OLD\.account_status/);
  assert.match(fn, /current_user IN \('authenticated', 'anon'\)/);
  assert.match(fn, /NOT public\.is_platform_admin\(\)/);
  // No staff exemption: is_agency_staff must not appear in the guard.
  assert.ok(!/is_agency_staff/.test(fn), "the guard must not exempt agency_staff");
  // INVOKER so SECURITY DEFINER onboarding RPCs / service role keep working.
  assert.match(fn.slice(0, fn.indexOf("AS $$")), /SECURITY INVOKER/);
});

test("profiles update policy has a WITH CHECK and no global is_agency_staff", () => {
  const upd = policyBlock("profiles_update_self_or_staff");
  assert.match(upd, /WITH CHECK/);
  assert.ok(!/is_agency_staff/.test(upd));
  const sel = policyBlock("profiles_select_self_or_staff");
  assert.ok(!/is_agency_staff/.test(sel));
  assert.match(sel, /staff_can_access_profile\(id\)/);
});

test("no profiles / talent_profiles / client_profiles policy in the file still uses the global is_agency_staff()", () => {
  const body = sql.replace(/^--.*$/gm, "");
  assert.ok(!/is_agency_staff\s*\(/.test(body), "global is_agency_staff() must be gone from every policy here");
  for (const name of [
    "profiles_select_self_or_staff",
    "profiles_update_self_or_staff",
    "talent_select_staff",
    "talent_insert_staff",
    "talent_update_own",
    "talent_delete_staff",
    "client_profiles_select_own",
    "client_profiles_write_own",
  ]) {
    assert.match(policyBlock(name), /TO authenticated/, `${name} must be TO authenticated (anon never runs the DEFINER helpers)`);
  }
});

test("tenant helpers are roster / membership / relationship scoped and not anon-executable", () => {
  assert.match(sql, /current_user_tenant_ids\(\)/);
  assert.match(sql, /agency_talent_roster/);
  assert.match(sql, /agency_client_relationships/);
  assert.match(sql, /agency_memberships/);
  for (const fn of [
    "staff_can_access_profile(uuid)",
    "staff_can_access_talent_profile(uuid)",
    "staff_can_access_client_profile(uuid)",
    "caller_is_staff_of_any_tenant()",
  ]) {
    assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon;`), `${fn} must revoke PUBLIC and anon`);
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated, service_role;`), `${fn} must grant authenticated`);
  }
  // Platform admins keep access; own row stays readable.
  assert.match(sql, /p_profile_id = auth\.uid\(\)/);
  assert.match(sql, /public\.is_platform_admin\(\)/);
});

test("the migration is a held file, one transaction, number >= 20261231415400", () => {
  assert.match(MIGRATION, /_pending_pm[\\/]20261231415400_/);
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
});

test("admin-talent mutations are roster-scoped, not the global requireStaff()", () => {
  const src = read("lib/server-actions/admin-talent.ts");
  const guard = read("lib/server/roster-scoped-staff.ts");
  assert.match(guard, /agency_talent_roster/);
  assert.match(guard, /super_admin/);
  assert.match(guard, /getTenantScope\(\)/);
  assert.equal((src.match(/await requireStaff\(\)/g) ?? []).length, 0, "no global requireStaff() left in admin-talent");
  assert.ok((src.match(/await requireRosterScopedStaff\(/g) ?? []).length >= 7);
});

test("createClientAccount (behind createAdminClient) writes app_role 'client' only for the brand-new user, with the service role", () => {
  const action = read("lib/server-actions/admin-clients.ts");
  const fn = action.slice(action.indexOf("export async function createAdminClient"));
  assert.match(fn, /createClientAccount\(/);
  assert.match(fn, /createServiceRoleClient\(\)/);
  const core = read("lib/server/create-client-account.ts");
  // The profile / client_profile writes go through the service-role client handed in as `admin` ...
  assert.match(core, /await admin\s*\.from\("profiles"\)/);
  assert.match(core, /await admin\.from\("client_profiles"\)/);
  assert.match(core, /app_role: "client"/);
  // ... keyed on the id the invite just returned, and only after the user is proven NEW (created in this call).
  assert.match(core, /\.eq\("id", userId\)/);
  const gate = core.indexOf("createdAt < startedAt - NEW_USER_SKEW_MS");
  const write = core.indexOf('app_role: "client"');
  assert.ok(gate > -1 && write > gate, "the new-user check must come BEFORE the app_role write");
  // The only delete is the rollback of that new user.
  assert.equal((core.match(/deleteUser\(/g) ?? []).length, 1);
});

test("global user search is platform-admin-only except the tenant-narrowed client picker", () => {
  const src = read("app/api/admin/users/global-search/route.ts");
  assert.match(src, /isPlatformAdmin = access\?\.app_role === "super_admin"/);
  assert.match(src, /roleParam !== "client"/);
  assert.match(src, /getTenantScope\(\)/);
  assert.match(src, /agency_client_relationships/);
});
