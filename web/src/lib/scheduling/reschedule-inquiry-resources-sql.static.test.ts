/**
 * TUL-1480: pins the held SQL (lock, self-exclusion, tenant scope, grants, one
 * transaction with the calendar) and the app wiring that calls it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INQUIRY_RESCHEDULE_RPC } from "./reschedule-booking";

const web = join(__dirname, "..", "..", "..");
const MIGRATION = join(web, "..", "supabase", "migrations", "_pending_pm", "20261231422200_reschedule_inquiry_booking_resources_tul1480.sql");
const sql = readFileSync(MIGRATION, "utf8");
const body = sql.slice(sql.indexOf("AS $$"), sql.lastIndexOf("$$;"));
const app = readFileSync(join(web, "src", "lib", "scheduling", "reschedule-booking.ts"), "utf8");

test("the function name matches the app's RPC name", () => {
  assert.equal(INQUIRY_RESCHEDULE_RPC, "reschedule_inquiry_booking_with_resources");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reschedule_inquiry_booking_with_resources\(/);
});

test("SECURITY DEFINER with a fixed search_path", () => {
  assert.match(sql, /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public\s+AS \$\$/);
});

test("service_role only: revoked from PUBLIC, anon and authenticated, with a self-check", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reschedule_inquiry_booking_with_resources\([^)]*\)\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reschedule_inquiry_booking_with_resources\([^)]*\)\s+TO service_role;/);
  const grants = sql.match(/GRANT EXECUTE[^;]*;/g) ?? [];
  assert.equal(grants.length, 1);
  assert.doesNotMatch(grants[0], /anon|authenticated|PUBLIC/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
});

test("tenant-checked: the booking's tenant, every allocation and every pool are scoped to p_tenant_id", () => {
  assert.match(body, /IF v_booking\.tenant_id IS DISTINCT FROM p_tenant_id THEN[\s\S]*?'wrong_tenant'/);
  assert.match(body, /WHERE a\.tenant_id = p_tenant_id/);
  assert.match(body, /IF v_anc\.tenant_id IS DISTINCT FROM p_tenant_id THEN/);
  assert.match(body, /WHERE id = v_alloc\.id\s+AND tenant_id = p_tenant_id;/);
});

test("locks: the booking, this booking's allocations and the pool chain (root-first) FOR UPDATE", () => {
  assert.match(body, /FROM public\.agency_bookings\s+WHERE id = p_booking_id\s+FOR UPDATE;/);
  assert.match(body, /AND a\.ends_at = v_booking\.ends_at\s+ORDER BY a\.pool_path::text, a\.id\s+FOR UPDATE/);
  assert.match(body, /WITH ORDINALITY[\s\S]*?ORDER BY x\.ord\s+FOR UPDATE OF p/);
});

test("only THIS booking's own allocations move: inquiry key prefix, no order line, its exact window", () => {
  assert.match(body, /v_prefix := 'inquiry:' \|\| v_booking\.source_inquiry_id::text \|\| ':resources';/);
  assert.match(body, /left\(a\.operation_key, length\(v_prefix\)\) = v_prefix/);
  assert.match(body, /AND a\.order_line_id IS NULL/);
  assert.match(body, /AND a\.starts_at = v_booking\.starts_at/);
  assert.match(body, /IF v_booking\.order_id IS NOT NULL OR v_booking\.source_inquiry_id IS NULL THEN/);
  assert.match(body, /'bad_resources_key'/);
});

test("THE SELF-EXCLUSION: every other live allocation counts against the new window, this one does not", () => {
  const count = body.slice(body.indexOf("SELECT COALESCE(SUM(al.units), 0) INTO v_used"), body.indexOf("IF v_used + v_alloc.units"));
  assert.match(count, /al\.pool_path @> ARRAY\[v_anc\.id\]/);
  assert.match(count, /AND al\.id <> v_alloc\.id/);
  assert.match(count, /al\.state = 'committed'\s+OR \(al\.state = 'hold' AND al\.expires_at > now\(\)\)/);
  assert.match(count, /tstzrange\(p_starts_at, p_ends_at, '\[\)'\)/);
  assert.match(body, /RAISE EXCEPTION 'sold_out' USING ERRCODE = 'RS005'/);
  assert.match(body, /RAISE EXCEPTION 'ancestor_full' USING ERRCODE = 'RS006'/);
});

test("one transaction: the calendar runs inside, and a refusal rolls the resource move back", () => {
  const move = body.indexOf("UPDATE public.capacity_allocations");
  const cal = body.indexOf("v_reply := public.reschedule_booking_set(");
  assert.ok(move > 0 && cal > move, "resources move, then the calendar, in the same function");
  assert.match(body, /RAISE EXCEPTION 'calendar_refused' USING ERRCODE = 'RS010';/);
  assert.match(body, /WHEN SQLSTATE 'RS010' THEN/);
  assert.match(body, /operation_key = p_resources_key/);
});

test("held migration, not a live one", () => {
  assert.ok(MIGRATION.includes("_pending_pm"));
  assert.match(sql, /^BEGIN;$/m);
  assert.match(sql, /^COMMIT;$/m);
});

test("app: orderless request bookings call the function; missing function falls back, other errors fail closed", () => {
  assert.match(app, /const orderlessRequest = Boolean\(booking\.source_inquiry_id && !booking\.order_id\);/);
  assert.match(app, /admin\.rpc\(INQUIRY_RESCHEDULE_RPC, \{/);
  assert.match(app, /p_resources_key: inquiryResourcesKey\(booking\.source_inquiry_id, \{ startsAt: input\.newStartsAt, endsAt \}\)/);
  assert.match(app, /err\?\.code === "PGRST202" \|\| err\?\.code === "42883"/);
  assert.match(app, /if \(call\.error && isMissingRpc\(call\.error\)\)/);
  const lines = app.split("\n").length;
  assert.ok(lines <= 800, `reschedule-booking.ts has ${lines} lines`);
});
