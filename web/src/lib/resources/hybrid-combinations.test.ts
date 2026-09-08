import { test } from "node:test";
import assert from "node:assert/strict";
import { remainingUnits } from "@/lib/capacity/remaining";
import type { CapacityAllocation, CapacityPool } from "@/lib/capacity/types";
import {
  listSpacePoolIds,
  reserveBreakoutRooms,
  reserveExclusiveSpace,
  reserveLiveRecording,
  reserveRetreatAddOn,
  reserveRetreatStay,
  reserveSupervisedService,
  reserveTournamentWindow,
} from "./hybrid-combinations";

const START = "2026-09-08T18:00:00.000Z";
const END = "2026-09-08T20:00:00.000Z";

function adminForTenant(tenantId = "t1") {
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
        ) =>
          Promise.resolve({
            data:
              table === "capacity_pools"
                ? ids.map((id) => ({ id, tenant_id: tenantId }))
                : [],
            error: null,
          }).then(resolve, reject),
      };
      return api;
    },
  } as never;
}

const ADMIN = adminForTenant();

const passCapacity = async (reqs: readonly { poolId: string }[]) => ({
  ok: true as const,
  allocationIds: reqs.map((_, i) => `a${i}`),
  expiresAt: null,
});
const passHold = async (_admin: unknown, input: { talentProfileId: string }) => ({
  ok: true as const,
  holdId: `h-${input.talentProfileId}`,
  expiresAt: null,
});
const noopRelease = {
  releaseCapacity: async () => ({ ok: true as const, released: 0, alreadyReleased: 0 }),
  releaseHold: async () => ({ ok: true as const }),
};

test("a supervised service refuses without a supervisor and writes nothing", async () => {
  let reserved = 0;
  const r = await reserveSupervisedService(
    ADMIN,
    {
      tenantId: "t1",
      studentId: "student-1",
      supervisorId: "",
      stationPoolId: "station-1",
      startsAt: START,
      endsAt: END,
    },
    {
      ...noopRelease,
      reserveCapacityBatch: async () => {
        reserved += 1;
        return { ok: true, allocationIds: ["x"], expiresAt: null };
      },
      placeHold: async () => {
        reserved += 1;
        return { ok: true, holdId: "x", expiresAt: null };
      },
    },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "invalid");
  assert.equal(reserved, 0);
});

test("a supervised service holds student, supervisor and station as one set", async () => {
  const placed: string[] = [];
  const pools: string[] = [];
  const r = await reserveSupervisedService(
    ADMIN,
    {
      tenantId: "t1",
      studentId: "student-1",
      supervisorId: "supervisor-1",
      stationPoolId: "station-1",
      startsAt: START,
      endsAt: END,
    },
    {
      ...noopRelease,
      reserveCapacityBatch: async (reqs) => {
        pools.push(...reqs.map((q) => q.poolId));
        return passCapacity(reqs);
      },
      placeHold: async (_a, input) => {
        placed.push(input.talentProfileId);
        return passHold(_a, input);
      },
    },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(placed.sort(), ["student-1", "supervisor-1"]);
  assert.deepEqual(pools, ["station-1"]);
});

test("listing courts for a tournament omits cafe offering pools", async () => {
  const rows = [
    { id: "court-1", tenant_id: "t1", subject_kind: "space" },
    { id: "cafe-stock", tenant_id: "t1", subject_kind: "offering" },
    { id: "court-2", tenant_id: "t1", subject_kind: "space" },
  ];
  const admin = {
    from: (table: string) => {
      const preds: Array<(row: (typeof rows)[number]) => boolean> = [];
      const match = () =>
        table === "capacity_pools" ? rows.filter((row) => preds.every((p) => p(row))) : [];
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          preds.push((row) => (row as Record<string, unknown>)[k] === v);
          return api;
        },
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: match(), error: null }),
      };
      return api;
    },
  };
  const listed = await listSpacePoolIds(admin as never, "t1");
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  assert.deepEqual(listed.poolIds, ["court-1", "court-2"]);
});

test("a tournament window reserves every court and does not take the cafe", async () => {
  const pools: string[] = [];
  const r = await reserveTournamentWindow(
    ADMIN,
    {
      tenantId: "t1",
      startsAt: START,
      endsAt: END,
      courtPoolIds: ["court-1", "court-2", "court-3"],
    },
    {
      ...noopRelease,
      reserveCapacityBatch: async (reqs) => {
        pools.push(...reqs.map((q) => q.poolId));
        return passCapacity(reqs);
      },
      placeHold: async () => ({ ok: true, holdId: "no", expiresAt: null }),
    },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(pools, ["court-1", "court-2", "court-3"]);
  assert.ok(!pools.includes("cafe-stock"));
});

test("a taken breakout room writes no rooms and no attendee seats", async () => {
  const released: string[] = [];
  const r = await reserveBreakoutRooms(
    ADMIN,
    {
      tenantId: "t1",
      startsAt: START,
      endsAt: END,
      roomPoolIds: ["room-a", "room-b", "room-c", "room-d"],
      attendeePoolId: "seats",
      attendeeCount: 40,
    },
    {
      ...noopRelease,
      reserveCapacityBatch: async () => ({ ok: false, reason: "sold_out", failedPoolId: "room-c" }),
      releaseCapacity: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
      placeHold: async () => ({ ok: true, holdId: "no", expiresAt: null }),
    },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.failedPoolId, "room-c");
  assert.equal(released.length, 0);
});

test("a live recording holds room, engineer and audience seats together", async () => {
  const placed: string[] = [];
  const pools: Array<{ poolId: string; units?: number }> = [];
  const r = await reserveLiveRecording(
    ADMIN,
    {
      tenantId: "t1",
      startsAt: START,
      endsAt: END,
      engineerId: "eng-1",
      roomPoolId: "studio-1",
      audiencePoolId: "seats-1",
      audienceSeats: 20,
    },
    {
      ...noopRelease,
      reserveCapacityBatch: async (reqs) => {
        pools.push(...reqs.map((q) => ({ poolId: q.poolId, units: q.units })));
        return passCapacity(reqs);
      },
      placeHold: async (_a, input) => {
        placed.push(input.talentProfileId);
        return passHold(_a, input);
      },
    },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(placed, ["eng-1"]);
  assert.deepEqual(pools, [
    { poolId: "studio-1", units: 1 },
    { poolId: "seats-1", units: 20 },
  ]);
});

test("workshop, private hire and admission cannot double-book the same room", () => {
  const room: CapacityPool = {
    id: "gallery-1",
    tenantId: "t1",
    subjectKind: "space",
    subjectId: "gallery-1",
    poolKey: "default",
    parentPoolId: null,
    poolPath: ["gallery-1"],
    unitsTotal: 1,
    overbookUnits: 0,
    holdTtlSeconds: 900,
    unitLabel: null,
    isActive: true,
  };
  const hire: CapacityAllocation = {
    id: "hire",
    poolId: "gallery-1",
    poolPath: ["gallery-1"],
    orderLineId: "hire-line",
    units: 1,
    state: "committed",
    startsAt: START,
    endsAt: END,
    expiresAt: null,
  };
  const window = { startsAt: START, endsAt: END };
  assert.equal(remainingUnits(room, [hire], window), 0);
});

test("a live recording without an engineer writes nothing", async () => {
  let reserved = 0;
  const r = await reserveLiveRecording(
    ADMIN,
    {
      tenantId: "t1",
      startsAt: START,
      endsAt: END,
      engineerId: "",
      roomPoolId: "studio-1",
      audiencePoolId: "seats-1",
      audienceSeats: 20,
    },
    {
      ...noopRelease,
      reserveCapacityBatch: async () => {
        reserved += 1;
        return { ok: true, allocationIds: ["x"], expiresAt: null };
      },
      placeHold: async () => {
        reserved += 1;
        return { ok: true, holdId: "x", expiresAt: null };
      },
    },
  );
  assert.equal(r.ok, false);
  assert.equal(reserved, 0);
});

test("private catering holds the kitchen so a pop-up the same evening is sold out", async () => {
  const pools: string[] = [];
  const first = await reserveExclusiveSpace(
    ADMIN,
    { tenantId: "t1", spacePoolId: "kitchen-1", startsAt: START, endsAt: END },
    {
      ...noopRelease,
      reserveCapacityBatch: async (reqs) => {
        pools.push(...reqs.map((q) => q.poolId));
        return passCapacity(reqs);
      },
      placeHold: async () => ({ ok: true, holdId: "no", expiresAt: null }),
    },
  );
  assert.equal(first.ok, true);
  const second = await reserveExclusiveSpace(
    ADMIN,
    { tenantId: "t1", spacePoolId: "kitchen-1", startsAt: START, endsAt: END },
    {
      ...noopRelease,
      reserveCapacityBatch: async () => ({ ok: false, reason: "sold_out", failedPoolId: "kitchen-1" }),
      placeHold: async () => ({ ok: true, holdId: "no", expiresAt: null }),
    },
  );
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.failedPoolId, "kitchen-1");
  assert.deepEqual(pools, ["kitchen-1"]);
});

test("a retreat stay holds each day's place; a sold-out later day writes nothing", async () => {
  const released: string[] = [];
  const r = await reserveRetreatStay(
    ADMIN,
    {
      tenantId: "t1",
      days: [
        { startsAt: "2026-09-08T08:00:00.000Z", endsAt: "2026-09-08T20:00:00.000Z", placePoolId: "retreat" },
        { startsAt: "2026-09-09T08:00:00.000Z", endsAt: "2026-09-09T20:00:00.000Z", placePoolId: "retreat" },
        { startsAt: "2026-09-10T08:00:00.000Z", endsAt: "2026-09-10T20:00:00.000Z", placePoolId: "retreat" },
      ],
    },
    {
      ...noopRelease,
      reserveCapacityBatch: async () => ({ ok: false, reason: "sold_out", failedPoolId: "retreat" }),
      releaseCapacity: async (ids) => {
        released.push(...ids);
        return { ok: true, released: ids.length, alreadyReleased: 0 };
      },
      placeHold: async () => ({ ok: true, holdId: "no", expiresAt: null }),
    },
  );
  assert.equal(r.ok, false);
  assert.equal(released.length, 0);
});

test("adding a massage on day two does not consume another retreat place", async () => {
  const pools: Array<{ poolId: string; units?: number }> = [];
  const placed: string[] = [];
  const r = await reserveRetreatAddOn(
    ADMIN,
    {
      tenantId: "t1",
      startsAt: "2026-09-09T14:00:00.000Z",
      endsAt: "2026-09-09T15:00:00.000Z",
      poolId: "massage-room",
      talentId: "therapist-1",
    },
    {
      ...noopRelease,
      reserveCapacityBatch: async (reqs) => {
        pools.push(...reqs.map((q) => ({ poolId: q.poolId, units: q.units })));
        return passCapacity(reqs);
      },
      placeHold: async (_a, input) => {
        placed.push(input.talentProfileId);
        return passHold(_a, input);
      },
    },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(pools, [{ poolId: "massage-room", units: 1 }]);
  assert.ok(!pools.some((p) => p.poolId === "retreat"));
  assert.deepEqual(placed, ["therapist-1"]);
});

test("an adoption event in hall A does not consume the grooming room", () => {
  const grooming: CapacityPool = {
    id: "groom",
    tenantId: "t1",
    subjectKind: "space",
    subjectId: "groom-1",
    poolKey: "default",
    parentPoolId: null,
    poolPath: ["groom"],
    unitsTotal: 1,
    overbookUnits: 0,
    holdTtlSeconds: 900,
    unitLabel: null,
    isActive: true,
  };
  const event: CapacityAllocation = {
    id: "adopt",
    poolId: "hall",
    poolPath: ["hall"],
    orderLineId: "event-line",
    units: 1,
    state: "committed",
    startsAt: START,
    endsAt: END,
    expiresAt: null,
  };
  assert.equal(remainingUnits(grooming, [event], { startsAt: START, endsAt: END }), 1);
});

test("exclusive hire of another workspace's kitchen writes nothing", async () => {
  let reserved = 0;
  const foreign = {
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => {
      const api: Record<string, unknown> = {
        select: () => api,
        in: () => api,
        then: (
          resolve: (v: { data: unknown; error: null }) => unknown,
          reject?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data:
              table === "capacity_pools"
                ? [{ id: "kitchen-other", tenant_id: "t-other" }]
                : [],
            error: null,
          }).then(resolve, reject),
      };
      return api;
    },
  } as never;
  const r = await reserveExclusiveSpace(
    foreign,
    { tenantId: "t1", spacePoolId: "kitchen-other", startsAt: START, endsAt: END },
    {
      ...noopRelease,
      reserveCapacityBatch: async () => {
        reserved += 1;
        return { ok: true, allocationIds: ["x"], expiresAt: null };
      },
      placeHold: async () => {
        reserved += 1;
        return { ok: true, holdId: "x", expiresAt: null };
      },
    },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "wrong_tenant");
  assert.equal(reserved, 0);
});

