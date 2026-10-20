/**
 * D5: cancelling an order from Messages gives its seats and stock back.
 *
 * `releaseOrderLinesCapacity` used to read `order_lines.allocation_ids`, a column
 * migration 20261228000144 DROPPED. The select errored, the function returned
 * silently, and the "partial" and "keep" cancel paths in
 * `messaging-money-actions.ts` never released anything. Allocations hang off
 * `capacity_allocations.order_line_id` (the FK that migration added); this test
 * drives a fake that behaves like the current schema.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseOrderLinesCapacity } from "@/lib/messaging/money";

const TENANT = "t-1";
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };

function fakeDb(allocations: Row[]) {
  const releases: string[][] = [];
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let columns = "";
    const run = (): Result => {
      if (table === "order_lines" && columns.includes("allocation_ids")) {
        return { data: null, error: { code: "42703", message: "column order_lines.allocation_ids does not exist" } };
      }
      if (table === "capacity_allocations") {
        return { data: allocations.filter((r) => filters.every((f) => f(r))), error: null };
      }
      return { data: [], error: null };
    };
    const api = {
      select: (c: string) => { columns = c; return api; },
      eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return api; },
      neq: (col: string, val: unknown) => { filters.push((r) => r[col] !== val); return api; },
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return api; },
      is: (col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return api; },
      then: (resolve: (v: Result) => unknown) => resolve(run()),
    };
    return api;
  };
  const rpc = async (fn: string, args: Record<string, unknown>): Promise<Result> => {
    if (fn === "release_capacity") {
      const ids = args.p_allocation_ids as string[];
      releases.push(ids);
      return { data: { released: ids.length, already_released: 0 }, error: null };
    }
    return { data: null, error: null };
  };
  return { admin: { from, rpc }, releases };
}

const ALLOCS: Row[] = [
  { id: "a-live", tenant_id: TENANT, order_line_id: "line-1", state: "hold", released_at: null },
  { id: "a-committed", tenant_id: TENANT, order_line_id: "line-2", state: "committed", released_at: null },
  { id: "a-gone", tenant_id: TENANT, order_line_id: "line-1", state: "released", released_at: "2026-10-19T00:00:00Z" },
  { id: "a-other-line", tenant_id: TENANT, order_line_id: "line-9", state: "hold", released_at: null },
  { id: "a-other-tenant", tenant_id: "t-2", order_line_id: "line-1", state: "hold", released_at: null },
];

test("a Messages cancel releases the lines' live allocations, found by order_line_id", async () => {
  const db = fakeDb(ALLOCS);
  await releaseOrderLinesCapacity(db.admin, TENANT, ["line-1", "line-2"]);
  assert.equal(db.releases.length, 1, "release_capacity must be called once");
  assert.deepEqual([...db.releases[0]].sort(), ["a-committed", "a-live"]);
});

test("no lines, or no live allocations: nothing is released", async () => {
  const empty = fakeDb(ALLOCS);
  await releaseOrderLinesCapacity(empty.admin, TENANT, []);
  assert.equal(empty.releases.length, 0);
  const none = fakeDb([ALLOCS[2]]);
  await releaseOrderLinesCapacity(none.admin, TENANT, ["line-1"]);
  assert.equal(none.releases.length, 0);
});
