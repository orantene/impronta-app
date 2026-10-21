/**
 * TUL-1813: staff_permissions is per-tenant. Static pins for the held
 * migration 20261231425800 and for every web/src reader of the table.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const ROOT = join(process.cwd(), "..");
const SQL_PATH = join(
  ROOT,
  "supabase",
  "migrations",
  "_pending_pm",
  "20261231425800_staff_permissions_tenant_scope.sql",
);
const sql = readFileSync(SQL_PATH, "utf8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

test("migration is held in _pending_pm at the PM-reserved version", () => {
  assert.ok(SQL_PATH.includes("_pending_pm"));
  assert.ok(
    !readdirSync(join(ROOT, "supabase", "migrations")).some((f) => f.startsWith("20261231425800")),
    "must not sit in the live migrations dir",
  );
});

test("header states the apply order (code first, then 425800) and the failure mode", () => {
  const header = sql.split("\n").filter((l) => l.startsWith("--")).join("\n");
  assert.match(header, /DEPLOY THE CODE FIRST/);
  assert.match(header, /THEN apply this migration/);
  assert.match(header, /BEFORE the code is live/);
  assert.match(header, /maybeSingle\(\)/);
  assert.match(header, /not the version number/);
});

test("adds tenant_id, backfills from active memberships, new composite PK", () => {
  assert.match(code, /ADD COLUMN tenant_id UUID REFERENCES public\.agencies/);
  assert.match(code, /FROM public\.agency_memberships m/);
  assert.match(code, /m\.profile_id = sp\.user_id AND m\.status = 'active'/);
  assert.match(code, /ALTER COLUMN tenant_id SET NOT NULL/);
  assert.match(code, /PRIMARY KEY \(user_id, tenant_id, permission\)/);
});

test("old policy dropped; four explicit per-command policies, WITH CHECK on writes", () => {
  assert.match(code, /DROP POLICY IF EXISTS staff_permissions_staff ON public\.staff_permissions/);
  for (const cmd of ["select", "insert", "update", "delete"]) {
    assert.match(code, new RegExp(`CREATE POLICY staff_permissions_${cmd}_tenant_admin`));
  }
  assert.ok(!/FOR ALL/i.test(code), "no FOR ALL policy");
  assert.match(code, /FOR INSERT[\s\S]*?WITH CHECK/);
  assert.match(code, /FOR UPDATE[\s\S]*?USING[\s\S]*?WITH CHECK/);
});

test("policy requires an active owner/admin of THAT row's tenant, no global staff check", () => {
  assert.match(code, /m\.profile_id = auth\.uid\(\)/);
  assert.match(code, /m\.status = 'active'/);
  assert.match(code, /m\.role IN \('owner', 'admin'\)/);
  assert.match(code, /m\.tenant_id = staff_permissions\.tenant_id/);
  assert.match(code, /public\.is_platform_admin\(\)/);
  assert.ok(!/is_agency_staff|is_staff_of_tenant|staff_is_admin_of_user_tenant/.test(code));
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !p.includes("database.types")) out.push(p);
  }
  return out;
}

/** file -> reason a direct staff_permissions read without a tenant filter is allowed. */
const ALLOW: Record<string, string> = {
  "src/lib/staff-permissions/read.ts": "the tenant-scoped reader itself (with the pre-migration fallback)",
  "src/lib/account/export-bundle.ts":
    "data-subject export of the person's OWN grants across all their workspaces; admin client, selects only `permission`, valid in both table shapes",
};

test("no web/src reader selects staff_permissions without the tenant-scoped helper", () => {
  const src = join(process.cwd(), "src");
  const offenders: string[] = [];
  for (const f of walk(src)) {
    const rel = relative(process.cwd(), f);
    const text = readFileSync(f, "utf8");
    if (!/["'`]staff_permissions["'`]/.test(text)) continue;
    if (ALLOW[rel]) continue;
    if (!text.includes("selectStaffPermissions")) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "read staff_permissions via selectStaffPermissions(...) with a tenantId");
});

test("callers pass a tenant id and never single-row read the table", () => {
  for (const rel of ["src/lib/messaging/money-permissions.ts", "src/lib/dashboard/admin-dashboard-data.ts"]) {
    const text = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(text, /selectStaffPermissions\(/, rel);
    assert.match(text, /tenantId:\s*(input\.tenantId|scope\.tenantId)/, rel);
    assert.ok(!/from\(["']staff_permissions["']\)/.test(text), `${rel} must not query the table directly`);
  }
  const helper = readFileSync(join(process.cwd(), "src/lib/staff-permissions/read.ts"), "utf8");
  const helperCode = helper.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n");
  assert.ok(!/maybeSingle|\.single\(/.test(helperCode));
});
