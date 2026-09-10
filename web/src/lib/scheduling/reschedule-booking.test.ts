/**
 * The reschedule wrapper: end resolution, buffer resolution, reason mapping.
 *
 * The move itself is one RPC, so there is nothing here to fake about the
 * WRITES — the fake `rpc` records the arguments and hands back a canned reply.
 * What this file protects is everything the wrapper still decides: that ONE
 * end time is computed and sent (the old code computed two and stored a
 * third), that the buffers come from the talent's hours and the space's
 * turnaround, and that every refusal the function can return reaches the
 * caller as its own reason rather than a generic failure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rescheduleBooking,
  resolveRescheduleBuffers,
  resolveRescheduleEndsAt,
} from "./reschedule-booking";

type Row = Record<string, unknown>;

type Store = {
  agency_bookings?: Row[];
  order_lines?: Row[];
  talent_offerings?: Row[];
  talent_bookings?: Row[];
  talent_booking_hours?: Row[];
  capacity_allocations?: Row[];
  space_assignments?: Row[];
  spaces?: Row[];
};

type RpcCall = { name: string; args: Record<string, unknown> };

function fakeAdmin(
  store: Store,
  opts: {
    rpcReply?: Row;
    rpcError?: { message: string } | null;
    readErrorOn?: string;
  } = {},
) {
  const calls: RpcCall[] = [];
  const admin = {
    from(table: string) {
      const rows = (store[table as keyof Store] ?? []) as Row[];
      const filters: Array<(r: Row) => boolean> = [];
      let sortKey: string | null = null;
      const settle = () => {
        if (opts.readErrorOn === table) {
          return { data: null, error: { code: "500", message: `read failed: ${table}` } };
        }
        let matched = rows.filter((r) => filters.every((f) => f(r)));
        if (sortKey) {
          const key = sortKey;
          matched = [...matched].sort(
            (a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0),
          );
        }
        return { data: matched, error: null };
      };
      const api = {
        select(_cols?: string) {
          return api;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return api;
        },
        neq(col: string, val: unknown) {
          filters.push((r) => r[col] !== val);
          return api;
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(r[col]));
          return api;
        },
        order(col: string) {
          sortKey = col;
          return api;
        },
        async maybeSingle() {
          const res = settle();
          if (res.error) return { data: null, error: res.error };
          return { data: (res.data ?? [])[0] ?? null, error: null };
        },
        then(resolve: (v: unknown) => void) {
          resolve(settle());
        },
      };
      return api;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.rpcReply ?? { ok: true, already: false }, error: null };
    },
  };
  return { admin, calls };
}

const OK_REPLY = {
  ok: true,
  already: false,
  previous_starts_at: "2026-10-01T10:00:00.000Z",
  previous_ends_at: "2026-10-01T11:00:00.000Z",
  starts_at: "2026-10-01T14:00:00.000Z",
  ends_at: "2026-10-01T15:00:00.000Z",
  moved_talent_bookings: 1,
  moved_allocations: 2,
};

function baseStore(over: Store = {}): Store {
  return {
    agency_bookings: [
      {
        id: "b1",
        tenant_id: "t1",
        order_id: "o1",
        source_inquiry_id: "inq1",
        starts_at: "2026-10-01T10:00:00.000Z",
        ends_at: "2026-10-01T11:00:00.000Z",
      },
    ],
    order_lines: [{ id: "ol1", tenant_id: "t1", order_id: "o1", offering_id: null, sort_order: 0 }],
    talent_offerings: [],
    talent_bookings: [
      { id: "tb1", tenant_id: "t1", inquiry_id: "inq1", talent_profile_id: "tal1", status: "confirmed" },
    ],
    talent_booking_hours: [],
    capacity_allocations: [],
    space_assignments: [],
    spaces: [],
    ...over,
  };
}

const INPUT = {
  tenantId: "t1",
  bookingId: "b1",
  newStartsAt: "2026-10-01T14:00:00.000Z",
  newEndsAt: null as string | null,
  actorUserId: "u1",
};

// ── end resolution ─────────────────────────────────────────────────────────

test("the end is resolved once and sent as one argument", async () => {
  const { admin, calls } = fakeAdmin(baseStore(), { rpcReply: OK_REPLY });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "reschedule_booking_set");
  assert.equal(calls[0].args.p_starts_at, "2026-10-01T14:00:00.000Z");
  assert.equal(
    calls[0].args.p_ends_at,
    "2026-10-01T15:00:00.000Z",
    "no offering duration means start plus sixty minutes",
  );
});

test("the offering's duration decides the end when the caller leaves it open", async () => {
  const store = baseStore({
    order_lines: [
      { id: "ol1", tenant_id: "t1", order_id: "o1", offering_id: "off1", sort_order: 0 },
    ],
    talent_offerings: [{ id: "off1", duration_minutes: 45 }],
  });
  const { admin, calls } = fakeAdmin(store, { rpcReply: OK_REPLY });
  await rescheduleBooking(admin as never, INPUT);
  assert.equal(calls[0].args.p_ends_at, "2026-10-01T14:45:00.000Z");
});

test("an explicit end wins over the offering's duration", async () => {
  const store = baseStore({
    order_lines: [
      { id: "ol1", tenant_id: "t1", order_id: "o1", offering_id: "off1", sort_order: 0 },
    ],
    talent_offerings: [{ id: "off1", duration_minutes: 45 }],
  });
  const { admin, calls } = fakeAdmin(store, { rpcReply: OK_REPLY });
  await rescheduleBooking(admin as never, {
    ...INPUT,
    newEndsAt: "2026-10-01T16:30:00.000Z",
  });
  assert.equal(calls[0].args.p_ends_at, "2026-10-01T16:30:00.000Z");
});

test("a failed duration read refuses rather than guessing an end", async () => {
  const store = baseStore({
    order_lines: [
      { id: "ol1", tenant_id: "t1", order_id: "o1", offering_id: "off1", sort_order: 0 },
    ],
    talent_offerings: [{ id: "off1", duration_minutes: 45 }],
  });
  const { admin, calls } = fakeAdmin(store, {
    rpcReply: OK_REPLY,
    readErrorOn: "talent_offerings",
  });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unavailable");
  assert.equal(calls.length, 0, "a booking must not move on a guessed end");
});

test("resolveRescheduleEndsAt refuses an end that is not after the start", () => {
  assert.equal(
    resolveRescheduleEndsAt("2026-10-01T14:00:00.000Z", "2026-10-01T14:00:00.000Z", null),
    null,
  );
  assert.equal(resolveRescheduleEndsAt("not a date", null, null), null);
  assert.equal(
    resolveRescheduleEndsAt("2026-10-01T14:00:00.000Z", null, 0),
    "2026-10-01T15:00:00.000Z",
    "a zero duration is not a duration",
  );
});

// ── buffer resolution ──────────────────────────────────────────────────────

test("buffers come from the talent's hours and the space's turnaround", async () => {
  const store = baseStore({
    talent_booking_hours: [
      { tenant_id: "t1", talent_profile_id: "tal1", buffer_before_min: 10, buffer_after_min: 5 },
    ],
    capacity_allocations: [{ id: "al1", tenant_id: "t1", order_line_id: "ol1", state: "committed" }],
    space_assignments: [{ tenant_id: "t1", allocation_id: "al1", space_id: "sp1" }],
    spaces: [{ id: "sp1", tenant_id: "t1", turn_minutes: 20 }],
  });
  const { admin, calls } = fakeAdmin(store, { rpcReply: OK_REPLY });
  await rescheduleBooking(admin as never, INPUT);
  assert.equal(calls[0].args.p_buffer_before_seconds, 600);
  assert.equal(
    calls[0].args.p_buffer_after_seconds,
    1200,
    "the table needs its twenty minutes even though the talent only asked for five",
  );
});

test("a released allocation's space does not lend its turnaround", async () => {
  const store = baseStore({
    capacity_allocations: [{ id: "al1", tenant_id: "t1", order_line_id: "ol1", state: "released" }],
    space_assignments: [{ tenant_id: "t1", allocation_id: "al1", space_id: "sp1" }],
    spaces: [{ id: "sp1", tenant_id: "t1", turn_minutes: 20 }],
  });
  const { admin, calls } = fakeAdmin(store, { rpcReply: OK_REPLY });
  await rescheduleBooking(admin as never, INPUT);
  assert.equal(calls[0].args.p_buffer_after_seconds, 0);
});

test("a failed buffer read still moves the booking", async () => {
  const store = baseStore({
    talent_booking_hours: [
      { tenant_id: "t1", talent_profile_id: "tal1", buffer_before_min: 10, buffer_after_min: 5 },
    ],
  });
  const { admin, calls } = fakeAdmin(store, {
    rpcReply: OK_REPLY,
    readErrorOn: "talent_booking_hours",
  });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, true);
  assert.equal(calls[0].args.p_buffer_before_seconds, 0);
});

test("resolveRescheduleBuffers takes the widest of each and ignores nonsense", () => {
  assert.deepEqual(
    resolveRescheduleBuffers(
      [
        { buffer_before_min: 10, buffer_after_min: 5 },
        { buffer_before_min: 30, buffer_after_min: null },
        { buffer_before_min: "20", buffer_after_min: -4 },
      ],
      [15, null, 99999],
    ),
    { beforeSeconds: 1800, afterSeconds: 1440 * 60 },
  );
});

// ── the expected window and the reasons ────────────────────────────────────

test("the expected window is passed through so a stale screen can be refused", async () => {
  const { admin, calls } = fakeAdmin(baseStore(), { rpcReply: OK_REPLY });
  await rescheduleBooking(admin as never, {
    ...INPUT,
    expectedStartsAt: "2026-10-01T10:00:00.000Z",
    expectedEndsAt: "2026-10-01T11:00:00.000Z",
  });
  assert.equal(calls[0].args.p_expected_starts_at, "2026-10-01T10:00:00.000Z");
  assert.equal(calls[0].args.p_expected_ends_at, "2026-10-01T11:00:00.000Z");
});

test("an operation key is always sent, derived from the intent when absent", async () => {
  const { admin, calls } = fakeAdmin(baseStore(), { rpcReply: OK_REPLY });
  await rescheduleBooking(admin as never, INPUT);
  assert.equal(calls[0].args.p_operation_key, "reschedule:b1:2026-10-01T14:00:00.000Z");

  const second = fakeAdmin(baseStore(), { rpcReply: OK_REPLY });
  await rescheduleBooking(second.admin as never, { ...INPUT, operationKey: "op-42" });
  assert.equal(second.calls[0].args.p_operation_key, "op-42");
});

test("a successful move reports what actually moved", async () => {
  const { admin } = fakeAdmin(baseStore(), { rpcReply: OK_REPLY });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.already, false);
  assert.deepEqual(r.previous, {
    startsAt: "2026-10-01T10:00:00.000Z",
    endsAt: "2026-10-01T11:00:00.000Z",
  });
  assert.equal(r.startsAt, "2026-10-01T14:00:00.000Z");
  assert.equal(r.endsAt, "2026-10-01T15:00:00.000Z");
  assert.equal(r.movedTalentBookings, 1);
  assert.equal(r.movedAllocations, 2);
});

test("a retry of the same intent comes back already, not moved twice", async () => {
  const { admin } = fakeAdmin(baseStore(), {
    rpcReply: { ...OK_REPLY, already: true, moved_talent_bookings: 0, moved_allocations: 0 },
  });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.already, true);
  assert.equal(r.movedTalentBookings, 0);
});

test("a stale screen is conflict, not a silent overwrite", async () => {
  const { admin } = fakeAdmin(baseStore(), {
    rpcReply: {
      ok: false,
      reason: "conflict",
      current_starts_at: "2026-10-02T09:00:00.000Z",
      current_ends_at: "2026-10-02T10:00:00.000Z",
    },
  });
  const r = await rescheduleBooking(admin as never, {
    ...INPUT,
    expectedStartsAt: "2026-10-01T10:00:00.000Z",
    expectedEndsAt: "2026-10-01T11:00:00.000Z",
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "conflict");
  assert.match(r.error, /Reload/);
});

test("a double book names the talent", async () => {
  const { admin } = fakeAdmin(baseStore(), {
    rpcReply: { ok: false, reason: "slot_taken", failed_talent_id: "tal1", failed_pool_id: null },
  });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "slot_taken");
  assert.equal(r.failedTalentId, "tal1");
});

test("a full room names the pool", async () => {
  const { admin } = fakeAdmin(baseStore(), {
    rpcReply: { ok: false, reason: "sold_out", failed_pool_id: "pool1", failed_talent_id: null },
  });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "sold_out");
  assert.equal(r.failedPoolId, "pool1");
});

test("a full ancestor pool is its own reason", async () => {
  const { admin } = fakeAdmin(baseStore(), {
    rpcReply: { ok: false, reason: "ancestor_full", failed_pool_id: "room1" },
  });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "ancestor_full");
  assert.equal(r.failedPoolId, "room1");
});

for (const reason of ["not_found", "wrong_tenant", "not_reschedulable", "invalid", "deadlock"]) {
  test(`the RPC's ${reason} reaches the caller as ${reason}`, async () => {
    const { admin } = fakeAdmin(baseStore(), { rpcReply: { ok: false, reason } });
    const r = await rescheduleBooking(admin as never, INPUT);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, reason);
  });
}

test("a reason this build does not know is unavailable, never a crash", async () => {
  const { admin } = fakeAdmin(baseStore(), { rpcReply: { ok: false, reason: "wormhole" } });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unavailable");
});

test("a transport failure is unavailable", async () => {
  const { admin } = fakeAdmin(baseStore(), { rpcError: { message: "socket hang up" } });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unavailable");
});

test("a booking outside this workspace never reaches the RPC", async () => {
  const { admin, calls } = fakeAdmin(baseStore(), { rpcReply: OK_REPLY });
  const r = await rescheduleBooking(admin as never, { ...INPUT, bookingId: "nope" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "not_found");
  assert.equal(calls.length, 0);
});

test("an unparseable start is refused before any read", async () => {
  const { admin, calls } = fakeAdmin(baseStore(), { rpcReply: OK_REPLY });
  const r = await rescheduleBooking(admin as never, { ...INPUT, newStartsAt: "soon" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "invalid");
  assert.equal(calls.length, 0);
});

test("an end that is not after the start is invalid, and nothing is called", async () => {
  const { admin, calls } = fakeAdmin(baseStore(), { rpcReply: OK_REPLY });
  const r = await rescheduleBooking(admin as never, {
    ...INPUT,
    newEndsAt: "2026-10-01T13:00:00.000Z",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "invalid");
  assert.equal(calls.length, 0);
});

test("a shell booking with no order and no inquiry still moves", async () => {
  const store = baseStore({
    agency_bookings: [
      {
        id: "b1",
        tenant_id: "t1",
        order_id: null,
        source_inquiry_id: null,
        starts_at: null,
        ends_at: null,
      },
    ],
  });
  const { admin, calls } = fakeAdmin(store, { rpcReply: OK_REPLY });
  const r = await rescheduleBooking(admin as never, INPUT);
  assert.equal(r.ok, true);
  assert.equal(calls[0].args.p_buffer_before_seconds, 0);
  assert.equal(calls[0].args.p_ends_at, "2026-10-01T15:00:00.000Z");
});
