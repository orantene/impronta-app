import { test } from "node:test";
import assert from "node:assert/strict";
import { cancelHybridComponents } from "./hybrid-package";
import { remainingUnits } from "@/lib/capacity/remaining";
import type { CapacityAllocation, CapacityPool } from "@/lib/capacity/types";

type Row = Record<string, unknown>;

function makeStore() {
  return {
    orders: [] as Row[],
    order_lines: [] as Row[],
    capacity_allocations: [] as Row[],
  };
}

function fakeAdmin(store: ReturnType<typeof makeStore>) {
  const tables: Record<string, Row[]> = store;
  const from = (table: string) => {
    const preds: Array<(row: Row) => boolean> = [];
    const match = () => (tables[table] ?? []).filter((row) => preds.every((p) => p(row)));
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        preds.push((row) => row[k] === v);
        return api;
      },
      in: (k: string, vals: unknown[]) => {
        preds.push((row) => vals.includes(row[k]));
        return api;
      },
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: match(), error: null }),
    };
    return api;
  };
  return { from };
}

test("cancelling catering releases only that line's capacity; the game stays held", async () => {
  const store = makeStore();
  store.orders.push({
    id: "ord",
    tenant_id: "ten",
    status: "paid",
  });
  store.order_lines.push(
    { id: "game", order_id: "ord", total_cents: 8000, refunded_cents: 0 },
    { id: "party", order_id: "ord", total_cents: 4000, refunded_cents: 0 },
    { id: "catering", order_id: "ord", total_cents: 2000, refunded_cents: 0 },
  );
  store.capacity_allocations.push(
    { id: "a-game", tenant_id: "ten", order_line_id: "game", released_at: null },
    { id: "a-party", tenant_id: "ten", order_line_id: "party", released_at: null },
    { id: "a-cater", tenant_id: "ten", order_line_id: "catering", released_at: null },
  );

  const released: string[] = [];
  const result = await cancelHybridComponents(
    fakeAdmin(store),
    { tenantId: "ten", orderId: "ord", lineIds: ["catering"] },
    {
      refundLines: async () => ({
        ok: true,
        refundedCents: 2000,
        refundIds: ["r1"],
        admissionsStamped: 0,
        admissionsIncomplete: false,
        releasedPromoRedemption: false,
      }),
      release: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.releasedAllocationIds, ["a-cater"]);
  assert.deepEqual(result.standingLineIds.sort(), ["game", "party"]);
  assert.deepEqual(released, ["a-cater"]);
  assert.equal(store.orders[0].status, "paid");
});

test("a hybrid cancel refuses a single-line order", async () => {
  const store = makeStore();
  store.orders.push({ id: "ord", tenant_id: "ten", status: "paid" });
  store.order_lines.push({ id: "only", order_id: "ord", total_cents: 1000, refunded_cents: 0 });
  const result = await cancelHybridComponents(fakeAdmin(store), {
    tenantId: "ten",
    orderId: "ord",
    lineIds: ["only"],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "not_a_component");
});

function pool(over: Partial<CapacityPool> = {}): CapacityPool {
  return {
    id: "pool-1",
    tenantId: "t1",
    subjectKind: "offering",
    subjectId: "s1",
    poolKey: "default",
    parentPoolId: null,
    poolPath: ["pool-1"],
    unitsTotal: 12,
    overbookUnits: 0,
    holdTtlSeconds: 900,
    unitLabel: null,
    isActive: true,
    ...over,
  };
}

test("a cafe sale and a room booking do not share a capacity pool", () => {
  const room = pool({
    id: "room",
    subjectKind: "space",
    subjectId: "meeting-1",
    poolPath: ["room"],
    unitsTotal: 1,
  });
  const cafe = pool({
    id: "cafe",
    subjectKind: "offering",
    subjectId: "coffee",
    poolPath: ["cafe"],
    unitsTotal: 40,
  });
  const cafeSale: CapacityAllocation = {
    id: "sale",
    poolId: "cafe",
    poolPath: ["cafe"],
    orderLineId: "coffee-line",
    units: 2,
    state: "committed",
    startsAt: "2026-09-08T12:00:00.000Z",
    endsAt: "2026-09-08T12:15:00.000Z",
    expiresAt: null,
  };
  const window = { startsAt: cafeSale.startsAt, endsAt: cafeSale.endsAt };
  assert.equal(remainingUnits(room, [cafeSale], window), 1);
  assert.equal(remainingUnits(cafe, [cafeSale], window), 38);
});

test("cancelling retreat day three leaves day one, day two and the massage standing", async () => {
  const store = makeStore();
  store.orders.push({ id: "ord", tenant_id: "ten", status: "paid" });
  store.order_lines.push(
    { id: "day-1", order_id: "ord", total_cents: 20000, refunded_cents: 0 },
    { id: "day-2", order_id: "ord", total_cents: 20000, refunded_cents: 0 },
    { id: "day-3", order_id: "ord", total_cents: 20000, refunded_cents: 0 },
    { id: "massage", order_id: "ord", total_cents: 8000, refunded_cents: 0 },
  );
  store.capacity_allocations.push(
    { id: "a-d1", tenant_id: "ten", order_line_id: "day-1", released_at: null },
    { id: "a-d2", tenant_id: "ten", order_line_id: "day-2", released_at: null },
    { id: "a-d3", tenant_id: "ten", order_line_id: "day-3", released_at: null },
    { id: "a-m", tenant_id: "ten", order_line_id: "massage", released_at: null },
  );
  const released: string[] = [];
  const result = await cancelHybridComponents(
    fakeAdmin(store),
    { tenantId: "ten", orderId: "ord", lineIds: ["day-3"] },
    {
      refundLines: async () => ({
        ok: true,
        refundedCents: 20000,
        refundIds: ["r1"],
        admissionsStamped: 0,
        admissionsIncomplete: false,
        releasedPromoRedemption: false,
      }),
      release: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(released, ["a-d3"]);
  assert.deepEqual(result.standingLineIds.sort(), ["day-1", "day-2", "massage"]);
});
