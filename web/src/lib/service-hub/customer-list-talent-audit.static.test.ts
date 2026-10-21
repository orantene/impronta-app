/**
 * TUL-1591 (c): AUDIT. Talents never get the workspace's customer list; only that
 * workspace's staff do (rule `customerListVisible`, TUL-1378 / #4178).
 *
 * Audited 2026-10-20 on the batch base. Two layers, both pinned here:
 *
 *  1. DATABASE. `customers` SELECT is staff-of-tenant for the workspace pool (owner NULL)
 *     and the owning talent for her own talent-owned rows only. "Staff" is an
 *     `agency_memberships` row, and no membership role is a talent role, so a roster talent
 *     is never staff of the agency she works with. `client_accounts` and
 *     `client_account_contacts` were moved to tenant-staff policies.
 *
 *  2. CODE. Service-role readers bypass RLS, so the talent-facing code is scanned: every
 *     file under the talent routes and talent libraries, plus everything they import
 *     directly, that names a customer-list table. Each such file is reviewed below: none
 *     returns a list of the workspace's customers to a talent. A NEW reference in any of
 *     these files, or a new file, fails this test until someone reviews it and adds it
 *     here with the reason.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const WEB = process.cwd();
const SRC = path.join(WEB, "src");
const MIGRATIONS = path.join(WEB, "..", "supabase", "migrations");

const CUSTOMER_TABLES = /["'](customers|client_accounts|client_account_contacts)["']/g;

/** Talent-facing roots: the talent workspace routes, the talent components and the talent libraries. */
const TALENT_ROOTS = [
  "app/(workspace)/[tenantSlug]/talent",
  "app/(workspace)/talent",
  "components/talent",
  "lib/talent",
  "lib/talent-agenda",
  "lib/talent-calendar",
  "lib/talent-dashboard.ts",
  "lib/talent-dashboard-data.ts",
];

/**
 * Reviewed files (path from src, count of customer-table names in the file) and why none of
 * them gives a talent the workspace's customer list.
 */
const REVIEWED: Record<string, { count: number; why: string }> = {
  "lib/talent-agenda/booking-actions.ts": {
    count: 2,
    why: "mark-no-show on the talent's OWN confirmed booking: reads and bumps one customer's no_shows counter by the booking's customer_id; nothing is returned to the talent",
  },
  "lib/promos/redemption/talent-cancel.ts": {
    count: 1,
    why: "make-good on a talent cancel: one customer row by id AND tenant for the booking's own redemption, used to send that client their code",
  },
  "lib/customers/ensure-customer.ts": {
    count: 3,
    why: "write path (find-or-create by exact email/phone for an order or inquiry); returns an id, never a list",
  },
  "lib/payments/link-checkout.ts": {
    count: 1,
    why: "one customer's own contact by id to prefill that customer's checkout; client-facing, not a talent list",
  },
  "lib/saas/admin-scope.ts": {
    count: 1,
    why: "a type literal in assertRowBelongsToTenant, a STAFF scope guard; no read for a talent",
  },
};

const EXTS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function walk(p: string, out: string[]): string[] {
  if (!existsSync(p)) return out;
  if (statSync(p).isFile()) {
    out.push(p);
    return out;
  }
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name);
    if (e.isDirectory()) walk(q, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(q);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXTS) if (existsSync(base + e)) return base + e;
  return null;
}

function talentFacingFiles(): Set<string> {
  const roots = TALENT_ROOTS.flatMap((r) => walk(path.join(SRC, r), []));
  const seen = new Set(roots);
  for (const f of roots) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = resolveImport(f, m[1] ?? m[2]);
      if (r && !/\.test\./.test(r) && !r.endsWith("database.types.ts")) seen.add(r);
    }
  }
  return seen;
}

describe("TUL-1591 (c): no talent-facing reader exposes the workspace's customer list", () => {
  test("the scan sees the talent surface (guard against an empty scan)", () => {
    const files = talentFacingFiles();
    assert.ok(files.size > 200, `scanned ${files.size} files`);
    assert.ok([...files].some((f) => f.includes(path.join("lib", "talent-agenda"))));
  });

  test("every talent-facing file (and its direct imports) that names a customer table is reviewed, with the same number of references", () => {
    const found: Record<string, number> = {};
    for (const f of talentFacingFiles()) {
      const n = (readFileSync(f, "utf8").match(CUSTOMER_TABLES) ?? []).length;
      if (n > 0) found[path.relative(SRC, f).split(path.sep).join("/")] = n;
    }
    for (const [file, n] of Object.entries(found)) {
      const r = REVIEWED[file];
      assert.ok(r, `${file} names a customer table and is reachable from a talent surface: review it and add it to REVIEWED with the reason`);
      assert.equal(n, r.count, `${file}: ${n} customer-table references, ${r.count} reviewed. Review the new one.`);
    }
  });

  test("the reviewed reads are single rows or writes, never a tenant-wide list", () => {
    const one = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
    const noShow = one("lib/talent-agenda/booking-actions.ts");
    // TUL-1757 (#4380): the no-show bump is one atomic RPC on the booking's own customer_id.
    assert.match(noShow, /admin\.rpc\("increment_customer_no_shows" as never, \{\s*p_customer_id: row\.customer_id,\s*\} as never\)/);
    assert.ok(!/\.from\("customers"\)\s*\.select\(/.test(noShow));
    const cancel = one("lib/promos/redemption/talent-cancel.ts");
    assert.match(cancel, /\.from\("customers"\)\s*\.select\("display_name, user_id"\)\s*\.eq\("id", customerId\)\s*\.eq\("tenant_id", tenantId\)\s*\.maybeSingle\(\)/);
    const link = one("lib/payments/link-checkout.ts");
    assert.match(link, /\.from\("customers"\)\s*\.select\("email, phone_e164, display_name"\)\s*\.eq\("id", customerId\)\s*\.maybeSingle\(\)/);
  });
});

function latest(pattern: RegExp): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let hit: { file: string; sql: string } | null = null;
  for (const f of files) {
    const sql = readFileSync(path.join(MIGRATIONS, f), "utf8");
    if (pattern.test(sql)) hit = { file: f, sql };
  }
  assert.ok(hit, `no migration matches ${pattern}`);
  return hit;
}

describe("TUL-1591 (c): the database only gives the customer list to that workspace's staff", () => {
  test("customers: workspace pool for staff of THAT tenant only; talent-owned rows for their owner only", () => {
    const { sql } = latest(/CREATE POLICY customers_staff_select ON public\.customers/);
    const staff = sql.slice(sql.indexOf("CREATE POLICY customers_staff_select"));
    assert.match(staff.slice(0, 400), /public\.is_staff_of_tenant\(tenant_id\)\s+AND owner_talent_profile_id IS NULL/);
    const owner = sql.slice(sql.indexOf("CREATE POLICY customers_owner_talent_select"));
    assert.match(owner.slice(0, 500), /tp\.id = owner_talent_profile_id\s+AND tp\.user_id = \(SELECT auth\.uid\(\)\)/);
  });

  test("staff means an agency_memberships row, and no membership role is a talent role", () => {
    const { sql: helper } = latest(/CREATE OR REPLACE FUNCTION public\.is_staff_of_tenant/);
    assert.match(helper, /FROM public\.agency_memberships m/);
    const { sql: roles } = latest(/ADD CONSTRAINT agency_memberships_role_check/);
    const check = roles.slice(roles.indexOf("ADD CONSTRAINT agency_memberships_role_check"));
    const list = check.slice(0, check.indexOf(";"));
    assert.match(list, /'owner'/);
    assert.doesNotMatch(list, /'talent'|'model'|'member'/);
  });

  test("client_accounts and client_account_contacts are tenant-staff only", () => {
    const sql = readFileSync(path.join(MIGRATIONS, "20260602100100_saas_p2_rls_tenant_scoped.sql"), "utf8");
    assert.match(sql, /'client_accounts',\s+'client_accounts_staff_all',\s+'client_accounts_tenant_staff'/);
    assert.match(sql, /'client_account_contacts',\s+'client_account_contacts_staff_all',\s+'client_account_contacts_tenant_staff'/);
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f > "20260602100100_saas_p2_rls_tenant_scoped.sql");
    for (const f of files) {
      assert.doesNotMatch(readFileSync(path.join(MIGRATIONS, f), "utf8"), /CREATE POLICY client_account(s|_contacts)_staff_all/, `${f} must not restore the global staff policy`);
    }
  });
});
