import { test } from "node:test";
import assert from "node:assert/strict";
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
  };
}

function fakeAdmin(store: ReturnType<typeof makeStore>) {
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
  return { from, rpc: async () => ({ data: null, error: null }) };
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
  let reserved = 0;
  const r = await holdDraftOrderCapacity(fakeAdmin(store), { tenantId: "t1", orderId: "ord" }, {
    reserveCapacityBatch: async () => {
      reserved += 1;
      return { ok: true, allocationIds: ["x"], expiresAt: null };
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.skipped, true);
  assert.equal(reserved, 0);
});

test("a sold-out class place refuses before money and writes nothing", async () => {
  const store = makeStore();
  seedSale(store, { poolId: "pool-1" });
  let reserved = 0;
  const r = await holdDraftOrderCapacity(fakeAdmin(store), { tenantId: "t1", orderId: "ord" }, {
    reserveCapacityBatch: async () => {
      reserved += 1;
      return { ok: false, reason: "sold_out", failedPoolId: "pool-1" };
    },
    releaseCapacity: async () => ({ ok: true, released: 0, alreadyReleased: 0 }),
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "sold_out");
  assert.equal(reserved, 1);
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
  let reserved = 0;
  const r = await holdDraftOrderCapacity(fakeAdmin(store), { tenantId: "t1", orderId: "ord" }, {
    reserveCapacityBatch: async () => {
      reserved += 1;
      return { ok: true, allocationIds: ["x"], expiresAt: null };
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.skipped, true);
  assert.deepEqual(r.allocationIds, ["a1"]);
  assert.equal(reserved, 0);
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
  let reserved = 0;
  const r = await holdDraftOrderCapacity(fakeAdmin(store), { tenantId: "t1", orderId: "ord" }, {
    reserveCapacityBatch: async () => {
      reserved += 1;
      return { ok: true, allocationIds: ["x"], expiresAt: null };
    },
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "wrong_tenant");
  assert.equal(reserved, 0);
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
  const pools: string[] = [];
  const r = await holdDraftOrderCapacity(fakeAdmin(store), { tenantId: "t1", orderId: "ord" }, {
    reserveCapacityBatch: async (reqs) => {
      pools.push(...reqs.map((req) => req.poolId));
      return { ok: true, allocationIds: ["x"], expiresAt: null };
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.skipped, false);
  assert.deepEqual(pools, ["session-pool"]);
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
  let reserved = 0;
  const r = await holdDraftOrderCapacity(fakeAdmin(store), { tenantId: "t1", orderId: "ord" }, {
    reserveCapacityBatch: async () => {
      reserved += 1;
      return { ok: true, allocationIds: ["x"], expiresAt: null };
    },
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "unavailable");
  assert.equal(reserved, 0);
});
