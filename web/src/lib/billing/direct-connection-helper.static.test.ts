/**
 * TUL-1748: the two SECURITY DEFINER gates that admit "internal" callers (the commercial-terms trigger
 * guard and the finance-writer gate) must not treat an EMPTY jwt role as a direct connection. One
 * shared helper answers it with `session_user <> 'authenticator'`: PostgREST always logs in as
 * `authenticator`; migrations, the SQL editor, psql and pg_cron do not.
 *
 * Source-level check by necessity (the migration is HELD and has never been run by this test): the
 * invariant is the shape of the DDL, including what is ABSENT from it.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const MIGRATIONS = resolve(process.cwd(), "..", "supabase", "migrations");
const VERSION = "20261231424700";
const FILE = `${VERSION}_caller_is_direct_connection_helper.sql`;
const SQL = readFileSync(resolve(MIGRATIONS, "_pending_pm", FILE), "utf8");
const CODE = SQL.replace(/--.*$/gm, "");

/** The body of one `CREATE OR REPLACE FUNCTION public.<name>` up to its closing `$$;`. */
function functionBody(name: string): string {
  const start = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `${name} is defined`);
  const open = CODE.indexOf("$$", start);
  const close = CODE.indexOf("$$;", open + 2);
  assert.ok(open > 0 && close > open, `${name} has a $$ body`);
  return CODE.slice(start, close + 3);
}

test("uses exactly the version the PM assigned, and sorts after 424500 and the finance gate", () => {
  assert.equal(VERSION, "20261231424700");
  assert.ok(existsSync(resolve(MIGRATIONS, "_pending_pm", "20261231424500_agencies_commercial_terms_admin_guard.sql")));
  assert.ok(existsSync(resolve(MIGRATIONS, "20261226000011_finance_p0_rpc_authorization.sql")));
  assert.ok(VERSION > "20261231424500" && VERSION > "20261226000011");
  // No other migration claims this version.
  assert.ok(!existsSync(resolve(MIGRATIONS, `${VERSION}_other.sql`)));
});

test("the helper is session_user <> 'authenticator', not a JWT claim", () => {
  const body = functionBody("caller_is_direct_connection");
  assert.match(body, /RETURNS boolean/i);
  assert.match(body, /SELECT\s+session_user\s*<>\s*'authenticator'/i);
  assert.ok(!/request\.jwt|current_setting|auth\.role|current_user/i.test(body), "no claim or current_user in the helper");
  assert.match(body, /SET search_path = pg_catalog/i);
});

test("the helper is granted explicitly to service_role only, and nothing opens it to the API roles", () => {
  assert.match(CODE, /REVOKE ALL ON FUNCTION public\.caller_is_direct_connection\(\) FROM PUBLIC/);
  assert.match(CODE, /REVOKE EXECUTE ON FUNCTION public\.caller_is_direct_connection\(\) FROM anon, authenticated/);
  assert.match(CODE, /GRANT EXECUTE ON FUNCTION public\.caller_is_direct_connection\(\) TO service_role/);
  assert.ok(!/GRANT EXECUTE ON FUNCTION public\.caller_is_direct_connection\(\)[^;]*\b(anon|authenticated|PUBLIC)\b/i.test(CODE));
});

for (const [name, mustKeep] of [
  ["engine_caller_may_write_tenant_finances", /public\.is_staff_of_tenant\(p_tenant_id\)/],
  ["agencies_guard_commercial_terms", /public\.is_platform_admin\(\)[\s\S]*agency_memberships[\s\S]*m\.role IN \('owner', 'admin'\)/],
] as const) {
  test(`${name}: admits service_role by its JWT role or a direct connection, never an empty role`, () => {
    const body = functionBody(name);
    assert.match(body, /v_caller_role = 'service_role'/);
    assert.match(body, /public\.caller_is_direct_connection\(\)/);
    assert.ok(!/IN \('service_role',\s*''\)/.test(body), "the empty-role shortcut is gone");
    assert.ok(!/v_caller_role\s*=\s*''/.test(body), "no empty-role comparison");
    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /SET search_path = public/);
    assert.match(body, mustKeep, "the rest of the gate is preserved");
  });
}

test("the finance gate keeps its ACL: no anon, authenticated and service_role may call it", () => {
  assert.match(CODE, /REVOKE ALL ON FUNCTION public\.engine_caller_may_write_tenant_finances\(UUID\) FROM PUBLIC/);
  assert.match(CODE, /REVOKE EXECUTE ON FUNCTION public\.engine_caller_may_write_tenant_finances\(UUID\) FROM anon/);
  assert.match(CODE, /GRANT EXECUTE ON FUNCTION public\.engine_caller_may_write_tenant_finances\(UUID\) TO authenticated, service_role/);
});

test("the commercial-terms trigger keeps its non-service-role rules and is not recreated here", () => {
  const body = functionBody("agencies_guard_commercial_terms");
  assert.match(body, /NEW\.settings -> 'commercialTerms' IS DISTINCT FROM OLD\.settings -> 'commercialTerms'/);
  assert.match(body, /ERRCODE = '42501'/);
  assert.match(body, /m\.status\s*=\s*'active'/);
  assert.ok(!/CREATE TRIGGER|DROP TRIGGER/.test(CODE), "the trigger itself stays in 424500");
  assert.match(CODE, /REVOKE ALL ON FUNCTION public\.agencies_guard_commercial_terms\(\) FROM PUBLIC/);
});

test("the migration is additive, idempotent and checks its own session", () => {
  assert.ok(!/DROP (TABLE|COLUMN|FUNCTION|POLICY)|TRUNCATE|DELETE FROM/i.test(CODE));
  assert.ok(CODE.match(/CREATE OR REPLACE FUNCTION/g)!.length === 3);
  assert.match(CODE, /IF NOT public\.caller_is_direct_connection\(\) THEN\s+RAISE EXCEPTION/);
});

test("the older migrations still say what they said (history is not rewritten)", () => {
  const finance = readFileSync(resolve(MIGRATIONS, "20261226000011_finance_p0_rpc_authorization.sql"), "utf8");
  assert.match(finance, /IN \('service_role', ''\)/);
  const held = readFileSync(resolve(MIGRATIONS, "_pending_pm", "20261231424500_agencies_commercial_terms_admin_guard.sql"), "utf8");
  assert.match(held, /IN \('service_role', ''\)/);
});
