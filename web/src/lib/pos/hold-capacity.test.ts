import { test } from "node:test";
import assert from "node:assert/strict";

import { grantedReply, type ReserveSetRpcCall } from "../../../test/helpers/reserve-set-fake";
import { holdDraftOrderCapacity } from "./hold-capacity";

type Row = Record<string, unknown>;

function makeStore() {
  return {
    orders: [] as Row[],
    order_lines: [] as Row[],
    talent_offerings: [] as Row[],
    capacity_allocations: [] as Row[],
    capacity_pools: [] as Row[],
    sessions: [] as Row[],
    talent_offering_variants: [] as Row[],
  };
}

/**
 * `reserve_resource_set_v2` is the only writer POS can reach, so the fake
 * records the command instead of the individual reservations: the TypeScript
 * path that used to place holds itself was deleted for double-allocating on a
 * lost answer.
 */
function fakeAdmin(
  store: ReturnType<typeof makeStore>,
  rpc?: (call: ReserveSetRpcCall) => { data: unknown; error: unknown },
  calls: ReserveSetRpcCall[] = [],
) {
  const tables: Record<string, Row[]> = store;
  const from = (table: string) => {
    let ids: string[] = [];
    const eqs: Array<[string, unknown]> = [];
    const match = () =>
      (tables[table] ?? []).filter((row) =>
        eqs.every(([k, v]) => {
          if (v && typeof v === "object" && v !== null && "__in" in v) {
            return (v as { __in: unknown[] }).__in.includes(row[k]);
          }
          return row[k] === v;
        }),
      );
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        eqs.push([k, v]);
        return api;
      },
      in: (k: string, vals: string[]) => {
        ids = vals;
        eqs.push([k, { __in: vals }]);
        return api;
      },
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      then: (
        resolve: (v: { data: unknown; error: null }) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        if (table === "capacity_pools" && ids.length > 0 && (tables.capacity_pools ?? []).length === 0) {
          return Promise.resolve({
            data: ids.map((id) => ({ id, tenant_id: "t1" })),
            error: null,
          }).then(resolve, reject);
        }
        return Promise.resolve({ data: match(), error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  return {
    from,
    rpc: async (fn: string, args: ReserveSetRpcCall["args"]) => {
      const call: ReserveSetRpcCall = { fn, args };
      calls.push(call);
      return rpc ? rpc(call) : { data: grantedReply(args), error: null };
    },
  };
}

function seedSale(store: ReturnType<typeof makeStore>, over: { poolId?: string | null; sessionId?: string | null } = {}) {
  store.orders.push({ id: "ord", tenant_id: "t1", status: "draft" });
  store.order_lines.push({
    id: "line-1",
    order_id: "ord",
    offering_id: "off-1",
    session_id: over.sessionId ?? null,
    units: 1,
  });
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    capacity_pool_id: over.poolId === undefined ? null : over.poolId,
    talent_profile_id: null,
    status: "published",
  });
}

test("a POS line with no pool does not reserve", async () => {
  const store = makeStore();
  seedSale(store);
  const calls: ReserveSetRpcCall[] = [];
  const r = await holdDraftOrderCapacity(fakeAdmin(store, undefined, calls), { tenantId: "t1", orderId: "ord" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.skipped, true);
  assert.equal(calls.length, 0);
});

test("a sold-out class place refuses before money and writes nothing", async () => {
  const store = makeStore();
  seedSale(store, { poolId: "pool-1" });
  const calls: ReserveSetRpcCall[] = [];
  const r = await holdDraftOrderCapacity(
    fakeAdmin(store, () => ({
      data: { ok: false, reason: "sold_out", failed_pool_id: "pool-1", failed_talent_id: null },
      error: null,
    }), calls),
    { tenantId: "t1", orderId: "ord" },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "sold_out");
  assert.equal(calls.length, 1);
});

test("a later split does not hold a second time", async () => {
  const store = makeStore();
  seedSale(store, { poolId: "pool-1" });
  store.capacity_allocations.push({
    id: "a1",
    tenant_id: "t1",
    order_line_id: "line-1",
    released_at: null,
  });
  const calls: ReserveSetRpcCall[] = [];
  const r = await holdDraftOrderCapacity(fakeAdmin(store, undefined, calls), { tenantId: "t1", orderId: "ord" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.skipped, true);
  assert.deepEqual(r.allocationIds, ["a1"]);
  assert.equal(calls.length, 0);
});

test("a class on another workspace's session writes nothing", async () => {
  const store = makeStore();
  seedSale(store, { poolId: "pool-1", sessionId: "ses-1" });
  store.sessions.push({
    id: "ses-1",
    tenant_id: "t-other",
    starts_at: "2026-09-08T18:00:00.000Z",
    ends_at: "2026-09-08T19:00:00.000Z",
  });
  const calls: ReserveSetRpcCall[] = [];
  const r = await holdDraftOrderCapacity(fakeAdmin(store, undefined, calls), { tenantId: "t1", orderId: "ord" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "wrong_tenant");
  assert.equal(calls.length, 0);
});

test("a walk-in holds the session tier pool, not the offering stock pool", async () => {
  const store = makeStore();
  seedSale(store, { poolId: "offering-pool", sessionId: "ses-1" });
  store.sessions.push({
    id: "ses-1",
    tenant_id: "t1",
    offering_id: "off-1",
    starts_at: "2026-09-08T18:00:00.000Z",
    ends_at: "2026-09-08T19:00:00.000Z",
  });
  store.capacity_pools.push({
    id: "session-pool",
    tenant_id: "t1",
    subject_kind: "session_tier",
    subject_id: "ses-1",
    pool_key: "default",
  });
  const calls: ReserveSetRpcCall[] = [];
  const r = await holdDraftOrderCapacity(fakeAdmin(store, undefined, calls), { tenantId: "t1", orderId: "ord" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.skipped, false);
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0]!.args.p_capacity ?? []).map((c) => c.pool_id), ["session-pool"]);
  assert.equal(calls[0]!.args.p_operation_key, "pos-hold:ord");
});

test("a tiered night holds the pool of the tier the line was sold at, not a 'default' that does not exist", async () => {
  // A night scheduled from an event has a pool per ticket tier ("seat"), and
  // no "default" pool. The line carries the tier's variant; the hold must
  // follow the variant's pool_key. Before the read this was refused as "not
  // selling places" while the public picker sold the same seat.
  const store = makeStore();
  seedSale(store, { poolId: null, sessionId: "ses-1" });
  store.order_lines[0]!.variant_id = "var-seat";
  store.talent_offering_variants.push({ id: "var-seat", offering_id: "off-1", pool_key: "seat" });
  store.sessions.push({
    id: "ses-1",
    tenant_id: "t1",
    offering_id: "off-1",
    starts_at: "2026-09-08T18:00:00.000Z",
    ends_at: "2026-09-08T19:00:00.000Z",
  });
  store.capacity_pools.push({
    id: "seat-pool",
    tenant_id: "t1",
    subject_kind: "session_tier",
    subject_id: "ses-1",
    pool_key: "seat",
  });
  const calls: ReserveSetRpcCall[] = [];
  const r = await holdDraftOrderCapacity(fakeAdmin(store, undefined, calls), { tenantId: "t1", orderId: "ord" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0]!.args.p_capacity ?? []).map((c) => c.pool_id), ["seat-pool"]);
});

test("a class with no session tier pool does not fall back to offering stock", async () => {
  const store = makeStore();
  seedSale(store, { poolId: "offering-pool", sessionId: "ses-1" });
  store.sessions.push({
    id: "ses-1",
    tenant_id: "t1",
    offering_id: "off-1",
    starts_at: "2026-09-08T18:00:00.000Z",
    ends_at: "2026-09-08T19:00:00.000Z",
  });
  const calls: ReserveSetRpcCall[] = [];
  const r = await holdDraftOrderCapacity(fakeAdmin(store, undefined, calls), { tenantId: "t1", orderId: "ord" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "unavailable");
  assert.equal(calls.length, 0);
});

test("a retried collection replays the same key rather than holding twice", async () => {
  const store = makeStore();
  seedSale(store, { poolId: "pool-1" });
  const calls: ReserveSetRpcCall[] = [];
  const first = await holdDraftOrderCapacity(fakeAdmin(store, undefined, calls), { tenantId: "t1", orderId: "ord" });
  const replay = await holdDraftOrderCapacity(
    fakeAdmin(store, (call) => ({
      data: { ...grantedReply(call.args), already: true },
      error: null,
    }), calls),
    { tenantId: "t1", orderId: "ord" },
  );
  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  if (!first.ok || !replay.ok) return;
  assert.deepEqual(
    calls.map((c) => c.args.p_operation_key),
    ["pos-hold:ord", "pos-hold:ord"],
    "the sale, not the attempt, names the command",
  );
  assert.deepEqual(replay.allocationIds, first.allocationIds);
});
