/**
 * TUL-1550 (P1 security, release gate): the POS link/reserve RPCs. Static checks on the held
 * migration: no raw database error reaches a caller, the operation key is stored and a retry
 * replays the first result, a closed order is refused, and the grants stay service_role only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const sql = readFileSync(
  join(process.cwd(), "..", "supabase", "migrations", "_pending_pm", "20261231425900_pos_rpc_hardening_tul1550.sql"),
  "utf8",
);
const fn = (name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf("REVOKE ALL ON FUNCTION", start));
};

test("no returned jsonb carries SQLERRM; the detail is logged instead", () => {
  assert.doesNotMatch(sql, /jsonb_build_object\([^;]*SQLERRM/);
  assert.doesNotMatch(sql, /'error',/);
  assert.match(fn("pos_reserve_collection"), /RAISE WARNING 'pos_reserve_collection failed: % \(SQLSTATE %\)', SQLERRM, SQLSTATE/);
  assert.match(fn("pos_reserve_collection"), /WHEN OTHERS THEN[\s\S]*'reason', 'unavailable'\);/);
});

test("the operation key is stored per tenant and a replay returns already:true", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pos_link_operations[\s\S]*PRIMARY KEY \(tenant_id, operation_key\)/);
  const link = fn("pos_link_booking");
  assert.match(link, /SELECT \* INTO v_op FROM public\.pos_link_operations/);
  assert.match(link, /'already', true/);
  assert.match(link, /'reason', 'key_reused'/);
  assert.ok((link.match(/INSERT INTO public\.pos_link_operations/g) ?? []).length >= 2, "written on the link and on the already-linked replay");
  assert.ok(link.indexOf("pos_link_operations") < link.indexOf("UPDATE public.order_lines"), "key read before the relink");
});

test("a closed or voided order is refused before any line is relinked", () => {
  const link = fn("pos_link_booking");
  assert.match(link, /v_order\.status NOT IN \('draft', 'pending_payment'\)[\s\S]*'reason', 'not_open'/);
  assert.ok(link.indexOf("'not_open'") < link.indexOf("UPDATE public.order_lines"));
});

test("the table is server-only and both functions stay service_role only", () => {
  assert.match(sql, /ALTER TABLE public\.pos_link_operations ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.pos_link_operations FROM anon, authenticated/);
  for (const sig of ["pos_link_booking(uuid, uuid, text, uuid, text)", "pos_reserve_collection(uuid, uuid, text, bigint, text, uuid, integer, integer)"]) {
    assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`), sig);
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`), sig);
  }
});

test("the migration uses the reserved version and is held, not in the applied folder", () => {
  assert.match(sql, /^-- TUL-1550/);
  assert.match(sql, /HELD: lives in _pending_pm/);
});
