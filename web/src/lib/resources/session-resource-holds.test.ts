import assert from "node:assert/strict";
import test from "node:test";

import {
  attendeeLinesThatHoldRoom,
  holdSessionResources,
  releaseResourcesOfCancelledSessions,
  releaseSessionResources,
  sessionResourceKey,
  sessionRoomSpaceIds,
  type SessionHoldDeps,
} from "./session-resource-holds";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const win = { startsAt: "2026-11-10T15:00:00Z", endsAt: "2026-11-10T16:00:00Z" };

test("the rooms of a service: spaceIds (many) or spaceId (one), valid uuids only, no duplicates", () => {
  assert.deepEqual(sessionRoomSpaceIds({ resourceSet: { spaceIds: [U1, U2, U1, "nope", 5] } }), [U1, U2]);
  assert.deepEqual(sessionRoomSpaceIds({ resourceSet: { spaceId: U1 } }), [U1]);
  assert.deepEqual(sessionRoomSpaceIds({ resourceSet: { spaceId: U1, spaceIds: [U2] } }), [U2, U1]);
  for (const bad of [null, undefined, "x", [], {}, { resourceSet: [] }, { resourceSet: { spaceIds: "x" } }]) assert.deepEqual(sessionRoomSpaceIds(bad), []);
});

test("the hold key belongs to the session", () => {
  assert.equal(sessionResourceKey("abc"), "session:abc:resources");
});

test("an attendee line that names a session never holds the room itself; other lines still do", () => {
  const lines = [{ offeringId: "class", sessionId: "s1" }, { offeringId: "massage", sessionId: null }, { offeringId: "mat" }];
  assert.deepEqual(attendeeLinesThatHoldRoom(lines).map((l) => l.offeringId), ["massage", "mat"]);
  assert.deepEqual(attendeeLinesThatHoldRoom([]), []);
});

type Calls = { reserve: unknown[]; commit: unknown[]; release: unknown[] };
function deps(over: Partial<SessionHoldDeps> = {}): { d: SessionHoldDeps; calls: Calls } {
  const calls: Calls = { reserve: [], commit: [], release: [] };
  const d: SessionHoldDeps = {
    spaceIdsForOffering: async () => ({ ok: true, spaceIds: [U1] }),
    poolForSpace: async (spaceId) => ({ ok: true, poolId: `pool-${spaceId.slice(0, 2)}` }),
    reserve: async (input) => {
      calls.reserve.push(input);
      return { ok: true, allocationIds: ["a1"] };
    },
    commit: async (ids) => {
      calls.commit.push(ids);
      return { ok: true };
    },
    release: async (ids) => {
      calls.release.push(ids);
      return { ok: true };
    },
    liveAllocationIds: async () => ["a1"],
    ...over,
  };
  return { d, calls };
}

test("a session holds each linked room ONCE for its window, under its own key, and the hold is committed (it must not expire)", async () => {
  const { d, calls } = deps();
  const r = await holdSessionResources({ tenantId: "t", sessionId: "s1", offeringId: "o", window: win }, d);
  assert.deepEqual(r, { ok: true, held: 1 });
  assert.equal(calls.reserve.length, 1);
  assert.deepEqual(calls.reserve[0], { tenantId: "t", operationKey: "session:s1:resources", poolIds: ["pool-11"], window: win });
  assert.deepEqual(calls.commit, [["a1"]]);
});

test("a service with no linked room holds nothing and asks the engine for nothing", async () => {
  const { d, calls } = deps({ spaceIdsForOffering: async () => ({ ok: true, spaceIds: [] }) });
  assert.deepEqual(await holdSessionResources({ tenantId: "t", sessionId: "s1", offeringId: "o", window: win }, d), { ok: true, held: 0 });
  assert.equal(calls.reserve.length, 0);
});

test("a second session at the same time in the same room is refused (taken)", async () => {
  const { d, calls } = deps({ reserve: async () => ({ ok: false, reason: "taken" }) });
  assert.deepEqual(await holdSessionResources({ tenantId: "t", sessionId: "s2", offeringId: "o", window: win }, d), { ok: false, reason: "room_taken" });
  assert.equal(calls.commit.length, 0);
});

test("fail closed: an unreadable service, a room with no pool, or an engine error refuse the session", async () => {
  for (const over of [
    { spaceIdsForOffering: async () => ({ ok: false as const }) },
    { poolForSpace: async () => ({ ok: false as const }) },
    { reserve: async () => ({ ok: false as const, reason: "unavailable" as const }) },
  ]) {
    const { d } = deps(over);
    assert.deepEqual(await holdSessionResources({ tenantId: "t", sessionId: "s", offeringId: "o", window: win }, d), { ok: false, reason: "room_unavailable" });
  }
});

test("if committing the hold fails, the hold is given back and the session is refused", async () => {
  const { d, calls } = deps({ commit: async () => ({ ok: false }) });
  assert.deepEqual(await holdSessionResources({ tenantId: "t", sessionId: "s", offeringId: "o", window: win }, d), { ok: false, reason: "room_unavailable" });
  assert.deepEqual(calls.release, [["a1"]]);
});

test("a bad window is refused before anything is held", async () => {
  const { d, calls } = deps();
  for (const w of [{ startsAt: "nope", endsAt: win.endsAt }, { startsAt: win.endsAt, endsAt: win.startsAt }]) {
    assert.deepEqual(await holdSessionResources({ tenantId: "t", sessionId: "s", offeringId: "o", window: w }, d), { ok: false, reason: "room_unavailable" });
  }
  assert.equal(calls.reserve.length, 0);
});

test("cancelling a session releases its room", async () => {
  const { d, calls } = deps({ liveAllocationIds: async () => ["a1", "a2"] });
  assert.deepEqual(await releaseSessionResources({ tenantId: "t", sessionId: "s1" }, d), { ok: true, released: 2 });
  assert.deepEqual(calls.release, [["a1", "a2"]]);
  const none = deps({ liveAllocationIds: async () => [] });
  assert.deepEqual(await releaseSessionResources({ tenantId: "t", sessionId: "s1" }, none.d), { ok: true, released: 0 });
  assert.equal(none.calls.release.length, 0);
});

test("a failed read of the live holds says so (not 'nothing to release')", async () => {
  const { d } = deps({ liveAllocationIds: async () => null });
  assert.deepEqual(await releaseSessionResources({ tenantId: "t", sessionId: "s1" }, d), { ok: false, released: 0 });
});

test("after a cancel, only the cancelled sessions among the candidates give their room back", async () => {
  const released: string[] = [];
  const d = deps({ liveAllocationIds: async (_t, key) => [`alloc-${key}`], release: async (ids) => (released.push(...ids), { ok: true }) }).d;
  const r = await releaseResourcesOfCancelledSessions({ tenantId: "t", sessions: [{ id: "a", status: "cancelled" }, { id: "b", status: "scheduled" }, { id: "c", status: "cancelled" }] }, d);
  assert.deepEqual(r, { ok: true, released: 2 });
  assert.deepEqual(released, ["alloc-session:a:resources", "alloc-session:c:resources"]);
});

// ── sweep: a cancelled session never keeps its room ───────────────────────────
import { sweepCancelledSessionRooms } from "./session-resource-holds";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

function sweepAdmin(live: Array<Record<string, unknown>>, sessions: Array<Record<string, unknown>>, fail?: "live" | "sessions") {
  const mk = (rows: Array<Record<string, unknown>>, failing: boolean) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.like = () => q;
    q.in = () => q;
    q.limit = async () => (failing ? { data: null, error: { message: "x" } } : { data: rows, error: null });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(failing ? { data: null, error: { message: "x" } } : { data: rows, error: null }).then(ok);
    return q;
  };
  return { from: (t: string) => (t === "capacity_allocations" ? mk(live, fail === "live") : mk(sessions, fail === "sessions")) } as never;
}

test("the sweep releases the room of a cancelled session and leaves a live session's room alone", async () => {
  const released: string[][] = [];
  const admin = sweepAdmin(
    [{ id: "a1", operation_key: `session:${S1}:resources` }, { id: "a2", operation_key: `session:${S2}:resources` }],
    [{ id: S1, status: "cancelled" }, { id: S2, status: "scheduled" }],
  );
  const r = await sweepCancelledSessionRooms(admin, { release: async (ids) => (released.push(ids), { ok: true }) });
  assert.deepEqual(r, { ok: true, released: 1 });
  assert.deepEqual(released, [["a1"]]);
});

test("the sweep fails closed on an unreadable read and releases nothing", async () => {
  const released: string[][] = [];
  for (const fail of ["live", "sessions"] as const) {
    const admin = sweepAdmin([{ id: "a1", operation_key: `session:${S1}:resources` }], [{ id: S1, status: "cancelled" }], fail);
    const r = await sweepCancelledSessionRooms(admin, { release: async (ids) => (released.push(ids), { ok: true }) });
    assert.deepEqual(r, { ok: false });
  }
  assert.deepEqual(released, []);
});

test("the sweep reports failure when the release itself fails", async () => {
  const admin = sweepAdmin([{ id: "a1", operation_key: `session:${S1}:resources` }], [{ id: S1, status: "cancelled" }]);
  assert.deepEqual(await sweepCancelledSessionRooms(admin, { release: async () => ({ ok: false }) }), { ok: false });
});
