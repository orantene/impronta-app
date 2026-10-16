import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Static checks on the migration: the properties that make the last seat safe
// and keep the DEFINER functions off the anon surface.
const SQL = readFileSync(
  join(process.cwd(), "..", "supabase", "migrations", "20261231382000_promo_redemption_service.sql"),
  "utf8",
);
// Strip comments so a comment cannot satisfy an assertion.
const CODE = SQL.replace(/--[^\n]*/g, "");

function fnBody(name: string): string {
  const start = CODE.indexOf(`FUNCTION public.${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  const end = CODE.indexOf("$$;", start);
  return CODE.slice(start, end);
}

const FNS = [
  ["promo_hold", "uuid, uuid, uuid, uuid, uuid, integer, bigint, boolean, text, text"],
  ["promo_confirm", "uuid, bigint, bigint, text, text, text"],
  ["promo_release", "uuid, boolean"],
  ["promo_no_show", "uuid"],
  ["promo_void", "uuid"],
  ["promo_sweep_expired_holds", "integer"],
] as const;

test("hold locks the promo row FOR UPDATE before counting, then inserts held", () => {
  const body = fnBody("promo_hold");
  const lock = body.search(/FROM public\.tenant_promo_codes\s+WHERE id = p_code_id\s+FOR UPDATE/);
  const count = body.indexOf("SELECT count(*) INTO v_total");
  const insert = body.indexOf("INSERT INTO public.tenant_promo_redemptions");
  assert.ok(lock >= 0 && count > lock && insert > count, "lock -> count -> insert order");
  assert.match(body, /'held', v_expires/);
});

test("expired holds are excluded from every limit count", () => {
  for (const name of ["promo_hold", "promo_confirm"]) {
    const body = fnBody(name);
    const counts = body.match(/SELECT count\(\*\)[\s\S]*?;/g) ?? [];
    assert.ok(counts.length > 0, `${name} counts`);
    for (const c of counts) {
      assert.match(c, /r\.status = 'held' AND \(r\.hold_expires_at IS NULL OR r\.hold_expires_at > now\(\)\)/);
    }
  }
});

test("hold checks max_redemptions, the 1-active-hold rule and per_customer_limit", () => {
  const body = fnBody("promo_hold");
  assert.match(body, /v_total >= v_code\.max_redemptions/);
  assert.match(body, /'hold_exists'/);
  assert.match(body, /v_for_cust >= v_code\.per_customer_limit/);
  assert.match(body, /p_customer_id IS NULL/);
});

test("hold minutes are bounded to 1..1440 (10 min to 24h)", () => {
  assert.match(fnBody("promo_hold"), /p_hold_minutes < 1 OR p_hold_minutes > 1440/);
});

test("every function is SECURITY DEFINER with a pinned search_path and returns jsonb", () => {
  for (const [name] of FNS) {
    const body = fnBody(name);
    assert.match(body, /RETURNS jsonb/);
    assert.match(body, /SECURITY DEFINER\s+SET search_path = public/);
  }
});

test("EXECUTE revoked from PUBLIC, anon, authenticated and granted to service_role only", () => {
  for (const [name, sig] of FNS) {
    assert.ok(
      CODE.includes(`REVOKE ALL ON FUNCTION public.${name}(${sig}) FROM PUBLIC, anon, authenticated;`),
      `${name} revoke`,
    );
    assert.ok(CODE.includes(`GRANT EXECUTE ON FUNCTION public.${name}(${sig}) TO service_role;`), `${name} grant`);
  }
  assert.doesNotMatch(CODE, /GRANT EXECUTE[^;]*TO (anon|authenticated|PUBLIC)/i);
});

test("the DO-block asserts anon/authenticated cannot execute any of them", () => {
  const check = CODE.slice(CODE.indexOf("DO $check$"));
  assert.match(check, /has_function_privilege\('anon', f, 'EXECUTE'\)/);
  assert.match(check, /has_function_privilege\('authenticated', f, 'EXECUTE'\)/);
  assert.match(check, /RAISE EXCEPTION/);
  for (const [name, sig] of FNS) {
    assert.ok(check.includes(`'public.${name}(${sig.replace(/ /g, "")})'`), `${name} asserted`);
  }
});

test("transitions are idempotent: repeating one returns already=true", () => {
  for (const name of ["promo_confirm", "promo_release", "promo_no_show", "promo_void"]) {
    assert.match(fnBody(name), /'already', true/);
  }
});

test("no_show is only reachable from confirmed; release from confirmed needs the flag", () => {
  assert.match(fnBody("promo_no_show"), /v_row\.status <> 'confirmed'/);
  assert.match(fnBody("promo_release"), /v_row\.status = 'confirmed' AND COALESCE\(p_from_confirmed, false\)/);
});

test("sweeper releases only expired held rows and skips locked ones", () => {
  const body = fnBody("promo_sweep_expired_holds");
  assert.match(body, /status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= now\(\)/);
  assert.match(body, /FOR UPDATE SKIP LOCKED/);
  assert.match(body, /SET status = 'released'/);
});
