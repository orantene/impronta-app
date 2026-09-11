/**
 * 20261230002200 created four tables with `ENABLE ROW LEVEL SECURITY` and NOT
 * ONE policy or grant. That reads as "closed" and is why it passed review, but
 * Supabase grants anon and authenticated table privileges on every new table,
 * so what actually shipped was four tables whose only protection was the
 * absence of a policy. The first permissive policy anyone added for one purpose
 * would have handed every tenant's rows to every signed-in user.
 *
 * 20261230002400 closes it. This test pins that it STAYS closed: every one of
 * the four must carry a tenant-staff SELECT policy built on
 * `is_staff_of_tenant`, a write revoke naming anon and authenticated, and an
 * anon SELECT revoke. Static — reads the migration text, no DB connection.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "..", "..", "supabase", "migrations");

const CREATED_IN = "20261230002200_catalog_tax_entitlements.sql";
const CLOSED_IN = "20261230002400_catalog_tax_entitlements_policies.sql";

const TABLES = [
  "tax_categories",
  "catalog_modifier_groups",
  "catalog_modifiers",
  "entitlement_credits",
] as const;

const sql = readFileSync(join(MIGRATIONS_DIR, CLOSED_IN), "utf8");

test("the table that created them still enables RLS on all four", () => {
  const created = readFileSync(join(MIGRATIONS_DIR, CREATED_IN), "utf8");
  for (const table of TABLES) {
    assert.match(
      created,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      `${table} must keep RLS enabled`,
    );
  }
});

for (const table of TABLES) {
  test(`${table} has a tenant-staff SELECT policy`, () => {
    const policy = new RegExp(
      `CREATE POLICY ${table}_staff_select ON public\\.${table}[\\s\\S]{0,200}?USING \\(public\\.is_staff_of_tenant\\(tenant_id\\)\\)`,
      "i",
    );
    assert.match(sql, policy, `${table} needs a staff SELECT policy keyed on is_staff_of_tenant`);
  });

  test(`${table} revokes writes from anon and authenticated`, () => {
    const revoke = new RegExp(
      `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\\.${table} FROM PUBLIC, anon, authenticated;`,
    );
    assert.match(sql, revoke, `${table} must revoke writes from PUBLIC, anon and authenticated`);
  });

  test(`${table} revokes anon SELECT and grants service_role`, () => {
    assert.match(sql, new RegExp(`REVOKE SELECT ON public\\.${table} FROM anon;`));
    assert.match(sql, new RegExp(`GRANT ALL ON public\\.${table} TO service_role;`));
  });
}

test("entitlement_credits also lets a customer read their own rows", () => {
  // Mirrors orders_customer_select: the credit is only spendable by the person
  // it belongs to, so that person has to be able to see it.
  assert.match(sql, /CREATE POLICY entitlement_credits_customer_select ON public\.entitlement_credits/);
  assert.match(sql, /FROM public\.customers c[\s\S]{0,160}?c\.user_id = auth\.uid\(\)/);
});

test("the migration asserts its own grants rather than trusting the apply", () => {
  assert.match(sql, /has_table_privilege\(/);
  assert.match(sql, /RAISE EXCEPTION/);
});

test("no policy predicate is revoked, which would break every query", () => {
  // is_staff_of_tenant is a predicate in ~181 live policies. Revoking EXECUTE
  // on it is a platform-wide outage dressed as hardening.
  assert.equal(
    /REVOKE[^;]*ON FUNCTION[^;]*is_staff_of_tenant/i.test(sql),
    false,
    "never revoke a function used as an RLS predicate",
  );
});
