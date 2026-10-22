import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { NON_MONEY_TRANSACTION_STATUSES } from "./collective-split-apply";

/**
 * TUL-1783: the DB twin of the TUL-1718 app rule. There is no database in the unit lane, so this pins the SQL contract:
 * the frozen predicate is the app's, the split columns are the ones the split writes, the bypass is deliberate and
 * service-role-only, and the trigger sorts after stale_clear.
 */
const SQL = readFileSync(
  join(process.cwd(), "..", "supabase/migrations/_pending_pm/20261231425400_order_lines_paid_split_guard_tul1783.sql"),
  "utf8",
);
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

test("the frozen predicate is the app's: every status except draft/cancelled/failed, or paid_at set", () => {
  const list = NON_MONEY_TRANSACTION_STATUSES.map((s) => `'${s}'`).join(", ");
  assert.match(code, new RegExp(`bt\\.status NOT IN \\(${list.replace(/[()]/g, "\\$&")}\\) OR bt\\.paid_at IS NOT NULL`));
  assert.match(code, /FROM public\.booking_transactions bt\s+WHERE bt\.order_id = p_order_id/);
});

test("every split input and output column is compared on UPDATE", () => {
  for (const col of ["order_id", "talent_profile_id", "owner_tenant_id", "units", "unit_cents", "total_cents", "discount_cents", "talent_cost_cents", "owner_take_cents", "owner_share_snapshot"]) {
    assert.match(code, new RegExp(`NEW\\.${col} IS NOT DISTINCT FROM OLD\\.${col}`), `${col} is guarded`);
  }
});

test("only split-carrying lines are guarded; label / refunded_cents / stamps stay free", () => {
  assert.match(code, /OLD\.owner_take_cents IS NOT NULL OR OLD\.owner_share_snapshot IS NOT NULL/);
  assert.doesNotMatch(code, /NEW\.refunded_cents|NEW\.label IS NOT DISTINCT/);
  assert.match(code, /IF NOT v_old_has AND NOT v_new_has THEN\s+RETURN NEW;/, "a line with no split before or after is untouched");
});

test("starting a split on a paid order is refused too (new split, old none)", () => {
  assert.match(code, /v_new_has := NEW\.owner_take_cents IS NOT NULL OR NEW\.owner_share_snapshot IS NOT NULL/);
});

test("DELETE of a split line is guarded, but a cascade from a deleted order is not", () => {
  assert.match(code, /BEFORE UPDATE OR DELETE ON public\.order_lines/);
  assert.match(code, /NOT EXISTS \(SELECT 1 FROM public\.orders o WHERE o\.id = OLD\.order_id\)/);
});

test("the only bypass is transaction-local AND service_role or the shared direct-connection helper (no empty-JWT shortcut)", () => {
  assert.match(code, /current_setting\('tulala\.paid_split_adjust', true\) = 'on'/);
  assert.match(code, /IF v_role = 'service_role' OR public\.caller_is_direct_connection\(\) THEN/);
  assert.doesNotMatch(code, /v_role IN \('service_role', ''\)/, "an empty jwt role is not a bypass (TUL-1748)");
  assert.match(SQL, /set_config\('tulala\.paid_split_adjust', 'on', true\)/, "documented as transaction-local (is_local = true)");
});

test("both functions are SECURITY DEFINER with a pinned search_path (the guard must not fail open under RLS), read-only", () => {
  const frozen = code.slice(code.indexOf("CREATE OR REPLACE FUNCTION public.order_is_money_frozen"), code.indexOf("COMMENT ON FUNCTION public.order_is_money_frozen"));
  assert.match(frozen, /STABLE\s+SECURITY DEFINER\s+SET search_path = public/);
  const guard = code.slice(code.indexOf("CREATE OR REPLACE FUNCTION public.order_lines_paid_split_guard"), code.indexOf("COMMENT ON FUNCTION public.order_lines_paid_split_guard"));
  assert.match(guard, /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/);
  assert.doesNotMatch(code, /INSERT INTO|UPDATE public\.|DELETE FROM/, "read-only helpers");
});

test("grants: order_is_money_frozen is executable by authenticated and service_role, never anon", () => {
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.order_is_money_frozen\(uuid\) TO authenticated, service_role/);
  assert.match(code, /REVOKE EXECUTE ON FUNCTION public\.order_is_money_frozen\(uuid\) FROM anon/);
  assert.match(code, /REVOKE EXECUTE ON FUNCTION public\.order_lines_paid_split_guard\(\) FROM anon/);
});

test("refusal is a check violation naming the order; the header says what to apply after", () => {
  assert.match(code, /ERRCODE = '23514'/);
  assert.match(SQL, /APPLY AFTER 20261231424700/);
});

test("the trigger fires after order_lines_owner_split_stale_clear (alphabetical order of BEFORE triggers)", () => {
  assert.ok("order_lines_paid_split_guard" > "order_lines_owner_split_stale_clear");
  assert.match(code, /CREATE TRIGGER order_lines_paid_split_guard\s+BEFORE/);
});

test("the migration documents its rollback and is held for the PM", () => {
  assert.match(SQL, /HELD in _pending_pm/);
  assert.match(SQL, /ROLLBACK:[\s\S]*DROP TRIGGER IF EXISTS order_lines_paid_split_guard/);
});
