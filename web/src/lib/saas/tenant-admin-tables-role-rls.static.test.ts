/**
 * TUL-1269 item 5 (package E6): team members cannot promote themselves or
 * rewrite other members' roles at the database layer.
 *
 * Pins the migration (applied on staging and prod 2026-10-20)
 *   supabase/migrations/20261231418000_tenant_admin_tables_role_aware_rls.sql
 * Static text pins only; the behaviour check is the rolled-back harness in the
 * file's header comment (PM runs it on staging).
 *
 * Run: npx tsx --test src/lib/saas/tenant-admin-tables-role-rls.static.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(
  HERE, "..", "..", "..", "..", "supabase", "migrations",
  "20261231418000_tenant_admin_tables_role_aware_rls.sql",
);
const sql = readFileSync(FILE, "utf8");
/** SQL with comment lines removed, so pins never match the explanation text. */
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

/** The CREATE POLICY statement for `name`, up to its terminating semicolon. */
function policy(name: string): string {
  const start = code.indexOf(`CREATE POLICY ${name} `);
  assert.ok(start >= 0, `policy ${name} must be created`);
  const end = code.indexOf(";", start);
  return code.slice(start, end);
}

test("the role helper admits only ACTIVE members holding one of the listed roles", () => {
  const start = code.indexOf("CREATE OR REPLACE FUNCTION public.caller_has_active_tenant_role(");
  assert.ok(start >= 0, "helper must be defined");
  const body = code.slice(start, code.indexOf("$$;", start));
  assert.match(body, /SECURITY DEFINER/);
  assert.match(body, /SET search_path = public/);
  assert.match(body, /public\.is_platform_admin\(\)/);
  assert.match(body, /m\.profile_id = auth\.uid\(\)/);
  assert.match(body, /m\.status\s+= 'active'/);
  assert.match(body, /m\.role\s+= ANY \(allowed_roles\)/);
  assert.doesNotMatch(body, /pending_acceptance/);
});

test("the helper is authenticated-only (policy helper, never anon)", () => {
  assert.match(
    code,
    /REVOKE ALL ON FUNCTION public\.caller_has_active_tenant_role\(uuid, text\[\]\) FROM PUBLIC, anon;/,
  );
  assert.match(
    code,
    /GRANT EXECUTE ON FUNCTION public\.caller_has_active_tenant_role\(uuid, text\[\]\) TO authenticated, service_role;/,
  );
});

test("the old role-blind FOR ALL policies are dropped on all three tables", () => {
  for (const [table, pol] of [
    ["agency_memberships", "agency_memberships_tenant_staff"],
    ["agencies", "agencies_tenant_staff"],
    ["agency_domains", "agency_domains_tenant_staff"],
  ] as const) {
    assert.match(code, new RegExp(`DROP POLICY IF EXISTS ${pol} ON public\\.${table};`));
    assert.doesNotMatch(code, new RegExp(`CREATE POLICY ${pol} `));
  }
});

test("reads stay on is_staff_of_tenant (pending invitees keep their read surface)", () => {
  assert.match(policy("agency_memberships_staff_read"), /FOR SELECT\s+USING \(public\.is_staff_of_tenant\(tenant_id\)\)/);
  assert.match(policy("agencies_staff_read"), /FOR SELECT\s+USING \(public\.is_staff_of_tenant\(id\)\)/);
  assert.match(policy("agency_domains_staff_read"), /FOR SELECT\s+USING \(public\.is_staff_of_tenant\(tenant_id\)\)/);
});

for (const cmd of ["insert", "update", "delete"] as const) {
  test(`agency_memberships ${cmd}: owner/admin only, never your own row, never an owner row`, () => {
    const p = policy(`agency_memberships_manager_${cmd}`);
    assert.match(p, new RegExp(`FOR ${cmd.toUpperCase()} TO authenticated`));
    assert.match(p, /public\.is_platform_admin\(\)/);
    assert.match(p, /public\.caller_has_active_tenant_role\(tenant_id, ARRAY\['owner', 'admin'\]\)/);
    assert.match(p, /profile_id <> auth\.uid\(\)/);
    assert.match(p, /role = ANY \(ARRAY\['admin', 'manager', 'coordinator', 'editor', 'viewer'\]\)/);
    assert.doesNotMatch(p, /is_staff_of_tenant/);
    if (cmd === "update") {
      // Both the row being changed and the row it becomes are checked.
      assert.match(p, /USING \(/);
      assert.match(p, /WITH CHECK \(/);
    }
  });
}

test("agencies: writers are ACTIVE non-viewer members; insert/delete are platform-admin only", () => {
  const upd = policy("agencies_member_update");
  assert.match(upd, /FOR UPDATE TO authenticated/);
  assert.match(
    upd,
    /public\.caller_has_active_tenant_role\(id, ARRAY\['owner', 'admin', 'manager', 'coordinator', 'editor'\]\)/,
  );
  assert.doesNotMatch(upd, /'viewer'/);
  const ins = policy("agencies_platform_admin_insert");
  assert.match(ins, /FOR INSERT TO authenticated\s+WITH CHECK \(public\.is_platform_admin\(\)\)/);
  const del = policy("agencies_platform_admin_delete");
  assert.match(del, /FOR DELETE TO authenticated\s+USING \(public\.is_platform_admin\(\)\)/);
});

test("agency_domains: writes need an ACTIVE owner or admin", () => {
  const p = policy("agency_domains_admin_write");
  assert.match(p, /FOR ALL TO authenticated/);
  assert.match(p, /USING\s+\(public\.caller_has_active_tenant_role\(tenant_id, ARRAY\['owner', 'admin'\]\)\)/);
  assert.match(p, /WITH CHECK \(public\.caller_has_active_tenant_role\(tenant_id, ARRAY\['owner', 'admin'\]\)\)/);
});

test("the file is held, transactional, and carries rollback + a rolled-back harness", () => {
  assert.match(code, /^BEGIN;/m);
  assert.match(code, /^COMMIT;/m);
  assert.match(sql, /^-- ROLLBACK\b/m);
  assert.match(sql, /SET LOCAL ROLE authenticated/);
  assert.match(sql, /request\.jwt\.claims/);
  assert.match(sql, /expect: ERROR|expect: 0 rows/);
});
