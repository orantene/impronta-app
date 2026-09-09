import { test } from "node:test";
import assert from "node:assert/strict";

import { remainingUnits } from "@/lib/capacity/remaining";
import type { CapacityAllocation, CapacityPool } from "@/lib/capacity/types";
import { fakeReserveSetAdmin, type ReserveSetRpcCall } from "../../../test/helpers/reserve-set-fake";
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

/** Every combination is one command; these read what that command carried. */
const poolsOf = (call: ReserveSetRpcCall) => (call.args.p_capacity ?? []).map((c) => String(c.pool_id));
const unitsOf = (call: ReserveSetRpcCall) =>
  (call.args.p_capacity ?? []).map((c) => ({ poolId: String(c.pool_id), units: c.units }));
const talentOf = (call: ReserveSetRpcCall) => (call.args.p_holds ?? []).map((h) => String(h.talent_profile_id));

const soldOut = (poolId: string) => () => ({
  data: { ok: false, reason: "sold_out", failed_pool_id: poolId, failed_talent_id: null },
  error: null,
});

test("a supervised service refuses without a supervisor and writes nothing", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveSupervisedService(admin, {
    tenantId: "t1",
    operationKey: "supervised:1",
    studentId: "student-1",
    supervisorId: "",
    stationPoolId: "station-1",
    startsAt: START,
    endsAt: END,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "invalid");
  assert.equal(calls.length, 0);
});

test("a supervised service holds student, supervisor and station as one set", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveSupervisedService(admin, {
    tenantId: "t1",
    operationKey: "supervised:1",
    studentId: "student-1",
    supervisorId: "supervisor-1",
    stationPoolId: "station-1",
    startsAt: START,
    endsAt: END,
  });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(talentOf(calls[0]!).sort(), ["student-1", "supervisor-1"]);
  assert.deepEqual(poolsOf(calls[0]!), ["station-1"]);
  assert.equal(calls[0]!.args.p_operation_key, "supervised:1");
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
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveTournamentWindow(admin, {
    tenantId: "t1",
    operationKey: "tournament:1",
    startsAt: START,
    endsAt: END,
    courtPoolIds: ["court-1", "court-2", "court-3"],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(poolsOf(calls[0]!), ["court-1", "court-2", "court-3"]);
  assert.ok(!poolsOf(calls[0]!).includes("cafe-stock"));
});

test("a taken breakout room writes no rooms and no attendee seats", async () => {
  const { admin, calls } = fakeReserveSetAdmin({ reply: soldOut("room-c") });
  const r = await reserveBreakoutRooms(admin, {
    tenantId: "t1",
    operationKey: "breakout:1",
    startsAt: START,
    endsAt: END,
    roomPoolIds: ["room-a", "room-b", "room-c", "room-d"],
    attendeePoolId: "seats",
    attendeeCount: 40,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.failedPoolId, "room-c");
  // One transaction refused as a whole. There is no half-held set to unwind,
  // which is the property the second reservation path used to destroy.
  assert.equal(calls.length, 1);
  assert.deepEqual(poolsOf(calls[0]!), ["room-a", "room-b", "room-c", "room-d", "seats"]);
});

test("a live recording holds room, engineer and audience seats together", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveLiveRecording(admin, {
    tenantId: "t1",
    operationKey: "recording:1",
    startsAt: START,
    endsAt: END,
    engineerId: "eng-1",
    roomPoolId: "studio-1",
    audiencePoolId: "seats-1",
    audienceSeats: 20,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(talentOf(calls[0]!), ["eng-1"]);
  assert.deepEqual(unitsOf(calls[0]!), [
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
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveLiveRecording(admin, {
    tenantId: "t1",
    operationKey: "recording:2",
    startsAt: START,
    endsAt: END,
    engineerId: "",
    roomPoolId: "studio-1",
    audiencePoolId: "seats-1",
    audienceSeats: 20,
  });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test("private catering holds the kitchen so a pop-up the same evening is sold out", async () => {
  const booked = fakeReserveSetAdmin();
  const first = await reserveExclusiveSpace(booked.admin, {
    tenantId: "t1",
    operationKey: "catering:1",
    spacePoolId: "kitchen-1",
    startsAt: START,
    endsAt: END,
  });
  assert.equal(first.ok, true);
  assert.deepEqual(poolsOf(booked.calls[0]!), ["kitchen-1"]);

  const popup = fakeReserveSetAdmin({ reply: soldOut("kitchen-1") });
  const second = await reserveExclusiveSpace(popup.admin, {
    tenantId: "t1",
    operationKey: "popup:1",
    spacePoolId: "kitchen-1",
    startsAt: START,
    endsAt: END,
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.failedPoolId, "kitchen-1");
});

test("a retreat stay holds each day's place; a sold-out later day writes nothing", async () => {
  const { admin, calls } = fakeReserveSetAdmin({ reply: soldOut("retreat") });
  const r = await reserveRetreatStay(admin, {
    tenantId: "t1",
    operationKey: "retreat:1",
    days: [
      { startsAt: "2026-09-08T08:00:00.000Z", endsAt: "2026-09-08T20:00:00.000Z", placePoolId: "retreat" },
      { startsAt: "2026-09-09T08:00:00.000Z", endsAt: "2026-09-09T20:00:00.000Z", placePoolId: "retreat" },
      { startsAt: "2026-09-10T08:00:00.000Z", endsAt: "2026-09-10T20:00:00.000Z", placePoolId: "retreat" },
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 1, "three days are one command, so a sold-out third day holds none of them");
  assert.equal(calls[0]!.args.p_capacity?.length, 3);
});

test("adding a massage on day two does not consume another retreat place", async () => {
  const { admin, calls } = fakeReserveSetAdmin();
  const r = await reserveRetreatAddOn(admin, {
    tenantId: "t1",
    operationKey: "retreat-addon:1",
    startsAt: "2026-09-09T14:00:00.000Z",
    endsAt: "2026-09-09T15:00:00.000Z",
    poolId: "massage-room",
    talentId: "therapist-1",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(unitsOf(calls[0]!), [{ poolId: "massage-room", units: 1 }]);
  assert.ok(!poolsOf(calls[0]!).includes("retreat"));
  assert.deepEqual(talentOf(calls[0]!), ["therapist-1"]);
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
  const { admin, calls } = fakeReserveSetAdmin({
    pools: [{ id: "kitchen-other", tenant_id: "t-other" }],
  });
  const r = await reserveExclusiveSpace(admin, {
    tenantId: "t1",
    operationKey: "catering:2",
    spacePoolId: "kitchen-other",
    startsAt: START,
    endsAt: END,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "wrong_tenant");
  assert.equal(calls.length, 0);
});
