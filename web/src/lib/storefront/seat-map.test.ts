import assert from "node:assert/strict";
import { test } from "node:test";

import { actSeatMapCore, readSeatMapCore, SEAT_HOLD_TTL_SECONDS, type SeatMapDeps } from "./seat-map.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";

const TENANT = uuid(1);
const EVENT = uuid(2);
const NIGHT = uuid(3);
const LAYOUT = uuid(4);
const VENUE = uuid(5);
const A1 = uuid(11);
const A2 = uuid(12);
const A3 = uuid(13);
const A4 = uuid(14);
const ME = uuid(20);
const OTHER = uuid(21);
const NOW = new Date("2026-09-15T18:00:00.000Z");

function setup(over: Partial<SeatMapDeps> = {}) {
  const { admin, store, calls } = fakeAdmin({
    events: [{ id: EVENT, tenant_id: TENANT, title: "Jazz night", status: "published", venue_id: VENUE }],
    sessions: [{ id: NIGHT, tenant_id: TENANT, event_id: EVENT, status: "scheduled", starts_at: "2026-09-20T20:00:00Z", ends_at: "2026-09-20T23:00:00Z", venue_id: VENUE }],
    venues: [{ id: VENUE, timezone: "America/Cancun" }],
    event_seat_maps: [{ tenant_id: TENANT, session_id: NIGHT, layout_id: LAYOUT }],
    space_layouts: [{ id: LAYOUT, name: "Main room", canvas: { w: 800, h: 600 } }],
    space_layout_items: [
      { layout_id: LAYOUT, space_id: A1, x: 10, y: 10, w: 30, h: 30, rotation: 0, shape: "round" },
      { layout_id: LAYOUT, space_id: A2, x: 50, y: 10, w: 30, h: 30, rotation: 0, shape: "round" },
      { layout_id: LAYOUT, space_id: A3, x: 90, y: 10, w: 30, h: 30, rotation: 0, shape: "round" },
      { layout_id: LAYOUT, space_id: A4, x: 130, y: 10, w: 30, h: 30, rotation: 0, shape: "round" },
    ],
    spaces: [
      { id: A1, tenant_id: TENANT, code: "A1", name: null, kind: "seat" },
      { id: A2, tenant_id: TENANT, code: "A2", name: null, kind: "seat" },
      { id: A3, tenant_id: TENANT, code: "A3", name: null, kind: "seat" },
      { id: A4, tenant_id: TENANT, code: "A4", name: null, kind: "seat" },
    ],
    admission_holds: [
      { id: uuid(30), tenant_id: TENANT, session_id: NIGHT, seat_space_id: A2, guest_session_id: OTHER, status: "held", expires_at: "2026-09-15T18:02:00Z", order_id: null, allocation_id: uuid(40) },
      { id: uuid(31), tenant_id: TENANT, session_id: NIGHT, seat_space_id: A3, guest_session_id: ME, status: "held", expires_at: "2026-09-15T18:01:30Z", order_id: null, allocation_id: uuid(41) },
      { id: uuid(32), tenant_id: TENANT, session_id: NIGHT, seat_space_id: A4, guest_session_id: OTHER, status: "converted", expires_at: "2026-09-15T17:00:00Z", order_id: uuid(50), allocation_id: null },
      { id: uuid(33), tenant_id: TENANT, session_id: NIGHT, seat_space_id: A1, guest_session_id: OTHER, status: "held", expires_at: "2026-09-15T17:00:00Z", order_id: null, allocation_id: null },
    ],
    orders: [{ id: uuid(50), status: "paid" }],
  });
  const released: string[][] = [];
  const holds: unknown[] = [];
  const deps: SeatMapDeps = {
    admin,
    identity: { guestKey: "g", userId: null, email: null, displayName: null },
    guestSessionRowId: ME,
    locale: "en",
    now: () => NOW,
    holdSeats: async (_a, i) => {
      holds.push(i);
      return { ok: true, id: uuid(60), ids: i.seatIds.map((_, n) => uuid(60 + n)), expiresAt: "2026-09-15T18:03:00Z", already: false };
    },
    releaseCapacity: async (ids) => {
      released.push([...ids]);
      return { ok: true, released: ids.length, alreadyReleased: 0 };
    },
    ...over,
  };
  return { deps, store, calls, released, holds };
}

test("read: the night's map with every seat's state — free, held by another, mine, sold; expired holds ignored", async () => {
  const { deps } = setup();
  const r = await readSeatMapCore(deps, TENANT, { eventId: EVENT });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.sessionId, NIGHT);
  assert.equal(r.data.eventTitle, "Jazz night");
  assert.equal(r.data.timezone, "America/Cancun");
  assert.deepEqual(r.data.layout, { id: LAYOUT, name: "Main room", canvas: { w: 800, h: 600 } });
  assert.deepEqual(
    r.data.seats.map((s) => [s.label, s.state]),
    [["A1", "free"], ["A2", "held"], ["A3", "mine"], ["A4", "sold"]],
  );
  assert.deepEqual(r.data.hold, { ids: [uuid(31)], seatIds: [A3], expiresAtIso: "2026-09-15T18:01:30Z" });
  assert.equal(r.data.holdTtlSeconds, SEAT_HOLD_TTL_SECONDS);
  assert.equal(r.data.seats[0]!.x, 10);
});

test("read: a converted hold on a cancelled order frees the seat; a past night is not open; an unknown event is not sellable", async () => {
  const { deps, store } = setup();
  store.orders![0]!.status = "cancelled";
  const r = await readSeatMapCore(deps, TENANT, { eventId: EVENT, sessionId: NIGHT });
  assert.ok(r.ok && r.data.seats[3]!.state === "free");
  const { deps: late } = setup({ now: () => new Date("2026-09-21T00:00:00Z") });
  assert.deepEqual(await readSeatMapCore(late, TENANT, { eventId: EVENT }), { ok: false, reason: "not_open" });
  assert.deepEqual(await readSeatMapCore(deps, TENANT, { eventId: uuid(99) }), { ok: false, reason: "not_sellable" });
});

test("act hold: needs a guest session; validates the night belongs to the event; holds through the engine with the TTL", async () => {
  const { deps, holds } = setup();
  const noGuest = await actSeatMapCore({ ...deps, guestSessionRowId: null }, { op: "hold", tenantId: TENANT, eventId: EVENT, sessionId: NIGHT, seatIds: [A1], operationKey: "sel-00001" });
  assert.ok(!noGuest.ok && noGuest.reason === "identity_required");
  const wrongEvent = await actSeatMapCore(deps, { op: "hold", tenantId: TENANT, eventId: uuid(99), sessionId: NIGHT, seatIds: [A1], operationKey: "sel-00001" });
  assert.ok(!wrongEvent.ok && wrongEvent.code === "not_found");
  const ok = await actSeatMapCore(deps, { op: "hold", tenantId: TENANT, eventId: EVENT, sessionId: NIGHT, seatIds: [A1, A1], operationKey: "sel-00001" });
  assert.deepEqual(ok, { ok: true, op: "hold", holdId: uuid(60), holdIds: [uuid(60)], seatIds: [A1], expiresAtIso: "2026-09-15T18:03:00Z", already: false });
  const sent = holds[0] as { guestSessionId: string; ttlSeconds: number; operationKey: string };
  assert.equal(sent.guestSessionId, ME);
  assert.equal(sent.ttlSeconds, SEAT_HOLD_TTL_SECONDS);
  assert.equal(sent.operationKey, "sel-00001");
});

test("act hold: engine refusals map — seat_taken → full, hold_expired → past, conflict → conflict; a replayed key says already", async () => {
  for (const [reason, bucket] of [["seat_taken", "full"], ["hold_expired", "past"], ["conflict", "conflict"]] as const) {
    const { deps } = setup({ holdSeats: async () => ({ ok: false, reason }) });
    const r = await actSeatMapCore(deps, { op: "hold", tenantId: TENANT, eventId: EVENT, sessionId: NIGHT, seatIds: [A1], operationKey: "sel-00002" });
    assert.ok(!r.ok && r.reason === bucket && r.code === reason, reason);
  }
  const { deps } = setup({ holdSeats: async () => ({ ok: true, id: uuid(60), ids: [uuid(60)], expiresAt: "x", already: true }) });
  const r = await actSeatMapCore(deps, { op: "hold", tenantId: TENANT, eventId: EVENT, sessionId: NIGHT, seatIds: [A1], operationKey: "sel-00002" });
  assert.ok(r.ok && r.op === "hold" && r.already === true);
});

test("act release: only this guest's live holds, capacity given back, others untouched", async () => {
  const { deps, store, released } = setup();
  const r = await actSeatMapCore(deps, { op: "release", tenantId: TENANT, sessionId: NIGHT });
  assert.deepEqual(r, { ok: true, op: "release", released: 1 });
  assert.deepEqual(released, [[uuid(41)]]);
  const mine = store.admission_holds!.find((h) => h.id === uuid(31))!;
  assert.equal(mine.status, "released");
  assert.equal(store.admission_holds!.find((h) => h.id === uuid(30))!.status, "held", "another guest's hold stays");
  const again = await actSeatMapCore(deps, { op: "release", tenantId: TENANT, sessionId: NIGHT });
  assert.deepEqual(again, { ok: true, op: "release", released: 0 });
});
