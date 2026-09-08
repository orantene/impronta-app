import { test } from "node:test";
import assert from "node:assert/strict";
import { expandedHoldWindow, reserveResourceSet, spaceCapacityPool } from "./reserve-set";

const START = "2026-09-08T15:00:00.000Z";
const END = "2026-09-08T16:00:00.000Z";

/** Synthesizes `capacity_pools` rows for this tenant unless `pools` is set. */
function adminWithPools(
  tenantId = "t1",
  pools?: ReadonlyArray<{ id: string; tenant_id: string }>,
) {
  const known = pools ? new Map(pools.map((p) => [p.id, p])) : null;
  return {
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => {
      let ids: string[] = [];
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: (_col: string, values: string[]) => {
          ids = values;
          return api;
        },
        then: (
          resolve: (v: { data: unknown; error: null }) => unknown,
          reject?: (e: unknown) => unknown,
        ) => {
          const data =
            table === "capacity_pools"
              ? ids.flatMap((id) => {
                  const hit = known?.get(id);
                  if (hit) return [hit];
                  if (known) return [];
                  return [{ id, tenant_id: tenantId }];
                })
              : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  } as never;
}

const ADMIN = adminWithPools();

test("travel buffers extend the hold window, not a second booking", () => {
  const w = expandedHoldWindow({
    talentProfileId: "tech-1",
    startsAt: START,
    endsAt: END,
    bufferBeforeSeconds: 30 * 60,
    bufferAfterSeconds: 15 * 60,
  });
  assert.ok(!("ok" in w));
  if ("ok" in w) return;
  assert.equal(w.startsAt, "2026-09-08T14:30:00.000Z");
  assert.equal(w.endsAt, "2026-09-08T16:15:00.000Z");
});

test("a bridal set of four technicians and four stations is all-or-nothing", async () => {
  const placed: string[] = [];
  const reservedPools: string[] = [];
  const released: string[] = [];
  const r = await reserveResourceSet(
    ADMIN,
    {
      tenantId: "t1",
      actorUserId: "u1",
      ttlSeconds: 900,
      holds: [1, 2, 3, 4].map((n) => ({
        talentProfileId: `tech-${n}`,
        startsAt: START,
        endsAt: END,
        title: "Bridal",
      })),
      capacity: [1, 2, 3, 4].map((n) => ({ poolId: `station-${n}`, units: 1, startsAt: START, endsAt: END })),
    },
    {
      reserveCapacityBatch: async (reqs) => {
        reservedPools.push(...reqs.map((q) => q.poolId));
        return { ok: true, allocationIds: reqs.map((_, i) => `alloc-${i + 1}`), expiresAt: "2026-09-08T15:15:00.000Z" };
      },
      releaseCapacity: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
      placeHold: async (_admin, input) => {
        const id = `hold-${input.talentProfileId}`;
        placed.push(id);
        return { ok: true, holdId: id, expiresAt: "2026-09-08T15:15:00.000Z" };
      },
      releaseHold: async (_admin, holdId) => {
        released.push(holdId);
        return { ok: true };
      },
    },
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.holdIds.length, 4);
  assert.equal(r.allocationIds.length, 4);
  assert.deepEqual(reservedPools, ["station-1", "station-2", "station-3", "station-4"]);
  assert.deepEqual(placed, ["hold-tech-1", "hold-tech-2", "hold-tech-3", "hold-tech-4"]);
  assert.equal(released.length, 0);
});

test("when a later technician is taken, stations already held are released", async () => {
  const released: string[] = [];
  const r = await reserveResourceSet(
    ADMIN,
    {
      tenantId: "t1",
      holds: [
        { talentProfileId: "tech-a", startsAt: START, endsAt: END },
        { talentProfileId: "tech-b", startsAt: START, endsAt: END },
      ],
      capacity: [{ poolId: "station-1", units: 1 }],
    },
    {
      reserveCapacityBatch: async () => ({ ok: true, allocationIds: ["alloc-1"], expiresAt: null }),
      releaseCapacity: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
      placeHold: async (_admin, input) => {
        if (input.talentProfileId === "tech-b") {
          return { ok: false, code: "slot_taken", error: "taken" };
        }
        return { ok: true, holdId: `hold-${input.talentProfileId}`, expiresAt: null };
      },
      releaseHold: async (_admin, holdId) => {
        released.push(holdId);
        return { ok: true };
      },
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "slot_taken");
  assert.equal(r.failedTalentId, "tech-b");
  assert.ok(released.includes("hold-tech-a"));
  assert.ok(released.includes("alloc-1"));
});

test("a sold-out station writes no calendar holds", async () => {
  let holds = 0;
  const r = await reserveResourceSet(
    ADMIN,
    {
      tenantId: "t1",
      holds: [{ talentProfileId: "tech-1", startsAt: START, endsAt: END }],
      capacity: [{ poolId: "station-pool", units: 1 }],
    },
    {
      reserveCapacityBatch: async () => ({ ok: false, reason: "sold_out", failedPoolId: "station-pool" }),
      releaseCapacity: async () => ({ ok: true, released: 0, alreadyReleased: 0 }),
      placeHold: async () => {
        holds += 1;
        return { ok: true, holdId: "should-not", expiresAt: null };
      },
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "sold_out");
  assert.equal(holds, 0);
});

test("five workers sharing three stations refuse the fourth for the station, not the technician", async () => {
  const r = await reserveResourceSet(
    ADMIN,
    {
      tenantId: "t1",
      holds: [{ talentProfileId: "tech-4", startsAt: START, endsAt: END }],
      capacity: [{ poolId: "stations-shared", units: 1 }],
    },
    {
      reserveCapacityBatch: async () => ({ ok: false, reason: "sold_out", failedPoolId: "stations-shared" }),
      releaseCapacity: async () => ({ ok: true, released: 0, alreadyReleased: 0 }),
      placeHold: async () => ({ ok: true, holdId: "no", expiresAt: null }),
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "sold_out");
  assert.equal(r.failedPoolId, "stations-shared");
  assert.equal(r.failedTalentId, null);
});

test("deadlock retries then refuses without leaking a hold", async () => {
  let attempts = 0;
  const released: string[] = [];
  const r = await reserveResourceSet(
    ADMIN,
    {
      tenantId: "t1",
      holds: [{ talentProfileId: "tech-1", startsAt: START, endsAt: END }],
      capacity: [{ poolId: "station-1", units: 1 }],
    },
    {
      reserveCapacityBatch: async () => ({ ok: true, allocationIds: ["alloc-1"], expiresAt: null }),
      releaseCapacity: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
      placeHold: async () => {
        attempts += 1;
        return { ok: false, code: "deadlock", error: "deadlock" };
      },
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "deadlock");
  assert.equal(attempts, 3);
  assert.equal(released.length, 3);
});

test("holds are placed in talent-id order", async () => {
  const order: string[] = [];
  await reserveResourceSet(
    ADMIN,
    {
      tenantId: "t1",
      holds: [
        { talentProfileId: "tech-c", startsAt: START, endsAt: END },
        { talentProfileId: "tech-a", startsAt: START, endsAt: END },
        { talentProfileId: "tech-b", startsAt: START, endsAt: END },
      ],
    },
    {
      reserveCapacityBatch: async () => ({ ok: true, allocationIds: [], expiresAt: null }),
      releaseCapacity: async () => ({ ok: true, released: 0, alreadyReleased: 0 }),
      placeHold: async (_admin, input) => {
        order.push(input.talentProfileId);
        return { ok: true, holdId: input.talentProfileId, expiresAt: null };
      },
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.deepEqual(order, ["tech-a", "tech-b", "tech-c"]);
});

test("spaceCapacityPool reads a space subject, never a person", async () => {
  const seen: Array<[string, unknown]> = [];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "capacity_pools");
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          seen.push([k, v]);
          return api;
        },
        maybeSingle: async () => ({ data: { id: "pool-station", units_total: 3 }, error: null }),
      };
      return api;
    },
  };
  const r = await spaceCapacityPool(admin as never, { tenantId: "t1", spaceId: "space-wash" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.poolId, "pool-station");
  assert.equal(r.unitsTotal, 3);
  assert.deepEqual(seen, [
    ["tenant_id", "t1"],
    ["subject_kind", "space"],
    ["subject_id", "space-wash"],
    ["pool_key", "default"],
  ]);
});

test("a pool from another workspace writes nothing", async () => {
  let reserved = 0;
  const r = await reserveResourceSet(
    adminWithPools("t1", [{ id: "kitchen-other", tenant_id: "t-other" }]),
    {
      tenantId: "t1",
      capacity: [{ poolId: "kitchen-other", units: 1, startsAt: START, endsAt: END }],
    },
    {
      reserveCapacityBatch: async () => {
        reserved += 1;
        return { ok: true, allocationIds: ["x"], expiresAt: null };
      },
      releaseCapacity: async () => ({ ok: true, released: 0, alreadyReleased: 0 }),
      placeHold: async () => {
        reserved += 1;
        return { ok: true, holdId: "x", expiresAt: null };
      },
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "wrong_tenant");
    assert.equal(r.failedPoolId, "kitchen-other");
  }
  assert.equal(reserved, 0);
});

test("an unknown pool id writes nothing", async () => {
  let reserved = 0;
  const r = await reserveResourceSet(
    adminWithPools("t1", []),
    {
      tenantId: "t1",
      capacity: [{ poolId: "missing-pool", units: 1, startsAt: START, endsAt: END }],
    },
    {
      reserveCapacityBatch: async () => {
        reserved += 1;
        return { ok: true, allocationIds: ["x"], expiresAt: null };
      },
      releaseCapacity: async () => ({ ok: true, released: 0, alreadyReleased: 0 }),
      placeHold: async () => ({ ok: true, holdId: "x", expiresAt: null }),
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "pool_not_found");
    assert.equal(r.failedPoolId, "missing-pool");
  }
  assert.equal(reserved, 0);
});

test("reserve_resource_set RPC conflict does not place a partial TypeScript hold", async () => {
  let holds = 0;
  const admin = {
    rpc: async () => ({
      data: { ok: false, reason: "slot_taken", failed_talent_id: "tech-b", failed_pool_id: null },
      error: null,
    }),
    from: (table: string) => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({
            data: table === "capacity_pools" ? [{ id: "station-1", tenant_id: "t1" }] : [],
            error: null,
          }).then(resolve),
      };
      return api;
    },
  } as never;
  const r = await reserveResourceSet(
    admin,
    {
      tenantId: "t1",
      holds: [
        { talentProfileId: "tech-a", startsAt: START, endsAt: END },
        { talentProfileId: "tech-b", startsAt: START, endsAt: END },
      ],
      capacity: [{ poolId: "station-1", units: 1, startsAt: START, endsAt: END }],
    },
    {
      reserveCapacityBatch: async () => ({ ok: true, allocationIds: ["alloc-1"], expiresAt: null }),
      releaseCapacity: async () => ({ ok: true, released: 0, alreadyReleased: 0 }),
      placeHold: async () => {
        holds += 1;
        return { ok: true, holdId: "should-not", expiresAt: null };
      },
      releaseHold: async () => ({ ok: true }),
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "slot_taken");
  assert.equal(r.failedTalentId, "tech-b");
  assert.equal(holds, 0);
});
