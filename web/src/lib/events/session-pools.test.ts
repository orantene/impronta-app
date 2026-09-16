import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSessionPoolRows, readCommittedPeak, type PeakClient } from "./session-pools";

function fakeAdmin(answers: Record<string, unknown | { error: string }>) {
  const calls: Array<{ fn: string; poolId: string }> = [];
  const admin: PeakClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, poolId: args.p_pool_id });
      const a = answers[args.p_pool_id];
      if (a && typeof a === "object" && "error" in a) return { data: null, error: { message: String(a.error) } };
      return { data: a ?? null, error: null };
    },
  };
  return { admin, calls };
}

test("the committed peak is read through the client it is given (the service-role one), one rpc per pool", async () => {
  const { admin, calls } = fakeAdmin({ "pool-a": 6, "pool-b": "3" });
  const rows = await buildSessionPoolRows(
    admin,
    [
      { label: "GA", pool_key: "ga" },
      { label: "VIP", pool_key: "vip" },
      { label: "No pool key", pool_key: null },
      { label: "Balcony", pool_key: "balcony" },
    ],
    [
      { id: "pool-a", pool_key: "ga", units_total: "100", overbook_units: 5, is_active: true },
      { id: "pool-b", pool_key: "vip", units_total: 20, overbook_units: 0, is_active: false },
    ],
  );
  assert.deepEqual(calls, [
    { fn: "capacity_pool_committed_peak", poolId: "pool-a" },
    { fn: "capacity_pool_committed_peak", poolId: "pool-b" },
  ]);
  assert.deepEqual(rows.map((r) => [r.poolKey, r.poolId, r.unitsTotal, r.committedPeak]), [
    ["ga", "pool-a", 100, 6],
    ["vip", "pool-b", 20, 3],
    ["balcony", null, null, null],
  ]);
});

test("a refused peak (42501) is null for that pool, never a thrown load", async () => {
  const { admin } = fakeAdmin({ "pool-a": { error: "permission denied for function capacity_pool_committed_peak" } });
  const peak = await readCommittedPeak(admin, "pool-a");
  assert.equal(peak, null);
});

test("loadSessionPools hands the SERVICE-ROLE client to the peak read after the staff check (D-147)", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "app", "(workspace)", "[tenantSlug]", "admin", "_events-actions.ts"),
    "utf8",
  );
  const fn = src.slice(src.indexOf("export async function loadSessionPools("), src.indexOf("export async function setSessionPoolUnits("));
  assert.match(fn, /requireWorkspaceStaffAction\(\)/);
  assert.match(fn, /buildSessionPoolRows\(\s*createServiceRoleClient\(\)/);
  assert.doesNotMatch(fn, /supabase\.rpc\("capacity_pool_committed_peak"/);
  // The elevated call is safe because the pools it reads are the tenant's.
  assert.match(fn, /from\("capacity_pools"\)[^\n]*\.eq\("tenant_id", tenantId\)/);
});
