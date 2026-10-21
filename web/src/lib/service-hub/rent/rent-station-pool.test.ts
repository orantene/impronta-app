/**
 * TUL-1600: assigning a station creates its pool right away (the member may have no offering yet), with the engine's
 * own plan and function; a container space is refused; nothing else is written.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ensureStationPool } from "./rent-station.server";

type Row = Record<string, unknown>;
function fake(tables: Record<string, Row[]>, rpcError = false) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    from(table: string) {
      let rows = tables[table] ?? [];
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      });
      return q;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return { error: rpcError ? { message: "x" } : null };
    },
  };
  return { admin: admin as never, rpcs };
}
const spaces = [
  { tenant_id: "t1", id: "chair", kind: "chair", parent_id: null, name: "Chair 2" },
  { tenant_id: "t1", id: "salon", kind: "area", parent_id: null, name: "Salon" },
];

describe("ensureStationPool", () => {
  test("a station with no pool gets a 1-unit default pool through the engine's function", async () => {
    const f = fake({ spaces, capacity_pools: [] });
    assert.deepEqual(await ensureStationPool(f.admin, { tenantId: "t1", spaceId: "chair" }), { ok: true });
    assert.equal(f.rpcs.length, 1);
    assert.equal(f.rpcs[0].fn, "upsert_capacity_pool");
    assert.equal(f.rpcs[0].args.p_units_total, 1);
    assert.equal(f.rpcs[0].args.p_subject_id, "chair");
    assert.equal(f.rpcs[0].args.p_pool_key, "default");
  });
  test("an existing pool is used as is: nothing is written", async () => {
    const f = fake({ spaces, capacity_pools: [{ tenant_id: "t1", id: "p1", subject_id: "chair", subject_kind: "space", pool_key: "default", units_total: 1, parent_pool_id: null }] });
    assert.deepEqual(await ensureStationPool(f.admin, { tenantId: "t1", spaceId: "chair" }), { ok: true });
    assert.equal(f.rpcs.length, 0);
  });
  test("a space that is not bookable, or one of another workspace, is refused", async () => {
    assert.deepEqual(await ensureStationPool(fake({ spaces, capacity_pools: [] }).admin, { tenantId: "t1", spaceId: "salon" }), { ok: false });
    assert.deepEqual(await ensureStationPool(fake({ spaces, capacity_pools: [] }).admin, { tenantId: "t2", spaceId: "chair" }), { ok: false });
  });
  test("a failed pool write fails the assignment", async () => {
    assert.deepEqual(await ensureStationPool(fake({ spaces, capacity_pools: [] }, true).admin, { tenantId: "t1", spaceId: "chair" }), { ok: false });
  });
  test("the assignment makes the pool before it touches any offering", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-station-actions.ts"), "utf8");
    assert.ok(src.indexOf("ensureStationPool(") < src.indexOf('"talent_offerings"'));
  });
});
