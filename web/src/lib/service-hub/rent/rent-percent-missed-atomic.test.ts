/** TUL-1751: the missed-percent marker is one atomic database append, never a read-modify-write of the array. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { markPercentMissed } from "./rent-autopay.server";

type RpcResult = { data: string | null; error: { message: string } | null };

/** Behaves like public.rent_mark_percent_missed over ONE shared array: the append and the "already there" check are a single step. */
function sharedPlan(initial: string[] = [], opts: { failWith?: string } = {}) {
  const missed = [...initial];
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = async (name: string, args: { p_plan_id: string; p_tenant_id: string; p_month: string }): Promise<RpcResult> => {
    calls.push({ name, args });
    await Promise.resolve(); // let concurrent callers interleave
    if (opts.failWith) return { data: null, error: { message: opts.failWith } };
    if (missed.includes(args.p_month)) return { data: "already", error: null };
    missed.push(args.p_month);
    return { data: "marked", error: null };
  };
  return { admin: { rpc } as never, missed, calls };
}
const mark = (admin: never, month: string) => markPercentMissed(admin, { tenantId: "t-1", planId: "plan-1", month, reason: "finalized" });

describe("markPercentMissed (atomic)", () => {
  test("two different months landing at the same time both persist", async () => {
    const w = sharedPlan();
    const [a, b] = await Promise.all([mark(w.admin, "2026-10"), mark(w.admin, "2026-11")]);
    assert.deepEqual([a, b], ["marked", "marked"]);
    assert.deepEqual([...w.missed].sort(), ["2026-10", "2026-11"]);
  });

  test("the same month twice marks once and reports 'already' the second time (so it notifies once)", async () => {
    const w = sharedPlan();
    const out = await Promise.all([mark(w.admin, "2026-11"), mark(w.admin, "2026-11")]);
    assert.deepEqual([...out].sort(), ["already", "marked"]);
    assert.deepEqual(w.missed, ["2026-11"]);
  });

  test("calls the RPC with the plan, the tenant and the month", async () => {
    const w = sharedPlan();
    await mark(w.admin, "2026-11");
    assert.deepEqual(w.calls, [{ name: "rent_mark_percent_missed", args: { p_plan_id: "plan-1", p_tenant_id: "t-1", p_month: "2026-11" } }]);
  });

  test("an RPC error is 'error' (the webhook retries), and an unexpected answer is 'error' too", async () => {
    assert.equal(await mark(sharedPlan([], { failWith: "boom" }).admin, "2026-11"), "error");
    const odd = { rpc: async () => ({ data: "not_found", error: null }) } as never;
    assert.equal(await mark(odd, "2026-11"), "error");
  });

  test("the code no longer reads and rewrites the array", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-autopay.server.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function markPercentMissed"), src.indexOf("export async function handleRentUnbilledPercent"));
    assert.match(fn, /admin\.rpc\("rent_mark_percent_missed"/);
    assert.ok(!/select\("autopay_percent_missed"\)|update\(\{ autopay_percent_missed/.test(fn), "no array read or write left in markPercentMissed");
  });
});

describe("the held migration for the RPC", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase/migrations/_pending_pm/20261231426700_rent_mark_percent_missed_rpc_tul1751.sql"), "utf8");
  test("appends atomically, tenant-scoped, and only for a month not already there", () => {
    assert.match(sql, /array_append\(autopay_percent_missed, p_month\)/);
    assert.match(sql, /AND tenant_id = p_tenant_id/);
    assert.match(sql, /NOT \(p_month = ANY \(autopay_percent_missed\)\)/);
  });
  test("SECURITY DEFINER with a pinned search_path; service_role only", () => {
    assert.match(sql, /SECURITY DEFINER\s+SET search_path = public/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.rent_mark_percent_missed\(uuid, uuid, text\) FROM PUBLIC, anon, authenticated;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.rent_mark_percent_missed\(uuid, uuid, text\) TO service_role;/);
  });
  test("is idempotent and documents order + rollback", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION/);
    assert.match(sql, /ORDER:[\s\S]*20261231423210/);
    assert.match(sql, /ROLLBACK:/);
  });
});
