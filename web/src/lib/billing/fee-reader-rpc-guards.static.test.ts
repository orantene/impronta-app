/**
 * TUL-1269 M3 (package E6, CALCULATION): the commission / fee reader RPCs and
 * the plan-override reconcile writer authorise their caller.
 *
 * Every one of them has a USER-SESSION caller (convertToBooking and
 * mark-as-cash run persistBookingCommissionSnapshot on the coordinator's own
 * client; the workspace dashboard self-heals overrides on the user client), so
 * the fix is an in-body guard, never a REVOKE from authenticated. A revoke
 * would make the fee readers fail, and commission-engine.ts swallows those
 * failures (base fee -> 0, split -> even), which would silently change money.
 *
 * Pins the HELD migration
 *   supabase/migrations/_pending_pm/20261231418200_fee_reader_rpc_caller_guards.sql
 *
 * Run: npx tsx --test src/lib/billing/fee-reader-rpc-guards.static.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "..", "..", "supabase", "migrations");
const FILE = join(MIGRATIONS, "_pending_pm", "20261231418200_fee_reader_rpc_caller_guards.sql");
const sql = readFileSync(FILE, "utf8");
const PRIOR_CONTEXT = readFileSync(
  join(MIGRATIONS, "20261231341000_commission_context_order_backed.sql"),
  "utf8",
);

/** Body of one CREATE OR REPLACE FUNCTION, up to its closing $function$;. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `${name} must be defined`);
  const end = src.indexOf("$function$;", src.indexOf("$function$", start) + 10);
  assert.ok(end > start, `${name} must close`);
  return src.slice(start, end);
}

const GUARD_RE = /\n *-- E6 CALLER GUARD BEGIN[\s\S]*?-- E6 CALLER GUARD END\n/;

test("engine_load_commission_context: guard is the only change to the deployed body", () => {
  const next = fnBody(sql, "engine_load_commission_context");
  const prior = fnBody(PRIOR_CONTEXT, "engine_load_commission_context");
  assert.match(next, GUARD_RE, "guard block must be marked");
  assert.equal(next.replace(GUARD_RE, "\n"), prior);
});

test("engine_load_commission_context: same admitted set as the snapshot writer", () => {
  const b = fnBody(sql, "engine_load_commission_context");
  const guard = b.match(GUARD_RE)?.[0] ?? "";
  // engine_persist_booking_commission_snapshot gates on exactly this helper
  // with the booking's tenant, so no caller that can write a snapshot loses
  // the read it needs first.
  assert.match(guard, /public\.engine_caller_may_write_tenant_finances\(v_home_tenant_id\)/);
  assert.match(guard, /RAISE EXCEPTION 'commission_context: forbidden' USING ERRCODE = '42501'/);
  // Guard runs right after the booking lookup and before any config / fee read.
  assert.ok(b.indexOf("E6 CALLER GUARD BEGIN") > b.indexOf("FROM public.agency_bookings b"));
  assert.ok(b.indexOf("E6 CALLER GUARD BEGIN") < b.indexOf("FROM public.platform_commission_config"));
});

test("engine_workspace_base_fee_inputs: tenant staff, or staff on an inquiry that tenant sells into", () => {
  const b = fnBody(sql, "engine_workspace_base_fee_inputs");
  assert.match(b, /SECURITY DEFINER/);
  assert.match(b, /public\.engine_caller_may_write_tenant_finances\(p_tenant_id\)/);
  // Cross-tenant booking: the converting coordinator is staff of the inquiry's
  // tenant, the fee belongs to the participant's workspace.
  assert.match(b, /ip\.owning_party_id = p_tenant_id/);
  assert.match(b, /public\.is_staff_of_tenant\(i\.tenant_id\)/);
  assert.match(b, /RAISE EXCEPTION 'base_fee_inputs: forbidden' USING ERRCODE = '42501'/);
  // Same four keys as before; the resolver reads exactly these.
  for (const k of [
    "base_reservation_fee_cents",
    "base_reservation_fee_bps",
    "max_base_fee_cents",
    "max_base_fee_bps",
  ]) {
    assert.match(b, new RegExp(`'${k}'`));
  }
  assert.ok(b.indexOf("RAISE EXCEPTION") < b.indexOf("jsonb_build_object"));
});

test("engine_platform_commission_split: service role, platform admin or a workspace member", () => {
  const b = fnBody(sql, "engine_platform_commission_split");
  assert.match(b, /SECURITY DEFINER/);
  assert.match(b, /v_caller_role IN \('service_role', ''\)/);
  assert.match(b, /public\.is_platform_admin\(\)/);
  assert.match(b, /cardinality\(public\.current_user_tenant_ids\(\)\) > 0/);
  assert.match(b, /client_surcharge_bps/);
  assert.match(b, /RAISE EXCEPTION 'commission_split: forbidden' USING ERRCODE = '42501'/);
});

test("reconcile_expired_plan_overrides: NULL sweep is service-role / platform-admin only", () => {
  const b = fnBody(sql, "reconcile_expired_plan_overrides");
  assert.match(b, /v_caller_role IN \('service_role', ''\)/);
  assert.match(b, /public\.is_platform_admin\(\)/);
  assert.match(b, /p_tenant_id IS NOT NULL AND public\.is_staff_of_tenant\(p_tenant_id\)/);
  assert.match(b, /RAISE EXCEPTION 'reconcile_expired_plan_overrides: forbidden' USING ERRCODE = '42501'/);
  // Guard precedes the first write.
  assert.ok(b.indexOf("RAISE EXCEPTION") < b.indexOf("UPDATE public.agencies"));
});

test("grants: authenticated keeps EXECUTE (user-session callers), anon never", () => {
  for (const sig of [
    "engine_load_commission_context(uuid)",
    "engine_workspace_base_fee_inputs(uuid)",
    "engine_platform_commission_split()",
    "reconcile_expired_plan_overrides(uuid)",
  ]) {
    const esc = sig.replace(/[()[\]]/g, "\\$&");
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon;`), sig);
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO authenticated, service_role;`), sig);
  }
});

test("the file is held, transactional, and carries rollback + a rolled-back harness", () => {
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  assert.match(sql, /^-- ROLLBACK\b/m);
  assert.match(sql, /SET LOCAL ROLE authenticated/);
  assert.match(sql, /request\.jwt\.claims/);
});
