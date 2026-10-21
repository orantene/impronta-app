/**
 * TUL-1311: `agencies.settings.commercialTerms` (default deposit %, refund
 * policy, instant book) must only be writable by service_role, a platform
 * admin, or an ACTIVE owner/admin of that agency, at the DATABASE level.
 * The agencies UPDATE policy admits editors, so a PostgREST PATCH from an
 * editor session could rewrite deposit terms; a BEFORE UPDATE trigger closes it.
 *
 * Source-level check by necessity: the invariant is an ABSENT guard in DDL.
 * The SQL has never been executed by this test (the migration is HELD).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const VERSION = "20261231424500";
const FILE = `${VERSION}_agencies_commercial_terms_admin_guard.sql`;
const SQL = readFileSync(
  resolve(process.cwd(), "..", "supabase", "migrations", "_pending_pm", FILE),
  "utf8",
);
// Strip line comments so assertions are about code, not prose.
const CODE = SQL.replace(/--.*$/gm, "");

test("guards a change to settings -> commercialTerms on UPDATE", () => {
  assert.match(CODE, /BEFORE UPDATE ON public\.agencies/i);
  assert.match(
    CODE,
    /NEW\.settings\s*->\s*'commercialTerms'\s+IS DISTINCT FROM\s+OLD\.settings\s*->\s*'commercialTerms'/i,
  );
  assert.match(CODE, /ERRCODE\s*=\s*'42501'/i);
});

test("admits service_role (both JWT claim shapes) and platform admins", () => {
  assert.match(CODE, /request\.jwt\.claims/);
  assert.match(CODE, /request\.jwt\.claim\.role/);
  assert.match(CODE, /'service_role'/);
  assert.match(CODE, /public\.is_platform_admin\(\)/);
});

test("admits only ACTIVE owner/admin members of that agency", () => {
  assert.match(CODE, /FROM public\.agency_memberships/i);
  assert.match(CODE, /m\.profile_id\s*=\s*auth\.uid\(\)/);
  assert.match(CODE, /m\.tenant_id\s*=\s*NEW\.id/);
  assert.match(CODE, /m\.status\s*=\s*'active'/);
  assert.match(CODE, /m\.role\s+IN\s*\(\s*'owner'\s*,\s*'admin'\s*\)/);
  for (const weak of ["editor", "coordinator", "viewer", "manager", "pending_acceptance"]) {
    assert.ok(!CODE.includes(`'${weak}'`), `must not admit ${weak}`);
  }
  assert.ok(!/is_tenant_admin|is_staff_of_tenant/.test(CODE), "no dependency on held/loose helpers");
});

test("is SECURITY DEFINER with a pinned search_path and idempotent", () => {
  assert.match(CODE, /CREATE OR REPLACE FUNCTION public\.agencies_guard_commercial_terms\(\)/);
  assert.match(CODE, /SECURITY DEFINER/);
  assert.match(CODE, /SET search_path = public/);
  assert.match(CODE, /DROP TRIGGER IF EXISTS \w+ ON public\.agencies/);
  assert.match(CODE, /REVOKE ALL ON FUNCTION public\.agencies_guard_commercial_terms\(\) FROM PUBLIC/);
});

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

test("every app writer of settings.commercialTerms is admin-gated or service-role", () => {
  const tenant = read("src/lib/server-actions/commercial-terms-tenant.ts");
  assert.match(
    tenant,
    /requireWorkspaceStaffAction\(\{\s*capability:\s*WORKSPACE_MONEY_GATES\.commercialTerms/,
  );
  const gates = read("src/lib/billing/workspace-money-gates.ts");
  assert.match(gates, /commercialTerms:\s*"manage_agency_settings"/);

  const platform = read("src/app/(workspace)/platform/admin/tenants/commercial-terms-actions.ts");
  assert.match(platform, /requirePlatformAdmin\(\)/);
  assert.match(platform, /createServiceRoleClient\(\)/);
});
