/**
 * TUL-1480: rescheduling an ORDERLESS request booking moves its chair, room or station
 * and its calendar in one transaction, with self-exclusion.
 *
 * The fake below models `reschedule_inquiry_booking_with_resources`
 * (supabase/migrations/_pending_pm/20261231422200_...): calls are serialized (the real
 * function locks the pool chain FOR UPDATE), each moving allocation is re-counted for the
 * new window EXCLUDING itself, and a refused calendar write restores everything (the
 * real function raises and the block rolls back). The SQL text itself is pinned by
 * reschedule-inquiry-resources-sql.static.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { INQUIRY_RESCHEDULE_RPC, rescheduleBooking } from "./reschedule-booking";
import { inquiryResourcesKey, inquiryResourcesPrefix } from "@/lib/resources/booking-resources";

type Alloc = {
  id: string;
  tenant_id: string;
  pool_id: string;
  operation_key: string;
  state: string;
  starts_at: string;
  ends_at: string;
  order_line_id: string | null;
  units: number;
};
type Booking = {
  id: string;
  tenant_id: string;
  order_id: string | null;
  source_inquiry_id: string | null;
  starts_at: string;
  ends_at: string;
};

const ms = (s: string) => Date.parse(s);
const overlaps = (a: { starts_at: string; ends_at: string }, s: string, e: string) => ms(a.starts_at) < ms(e) && ms(s) < ms(a.ends_at);

function fakeDb(opts: { units?: number; missingRpc?: boolean; calendarReply?: Record<string, unknown>; rpcError?: { code: string; message: string } } = {}) {
  const units = opts.units ?? 1;
  const bookings: Booking[] = [];
  const allocs: Alloc[] = [];
  const calls: string[] = [];
  let n = 0;
  let chain = Promise.resolve();
  const serial = <T>(fn: () => T): Promise<T> => {
    const run = chain.then(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return fn();
    });
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
  const live = (a: Alloc) => a.state !== "released";
  const usedExcept = (pool: string, s: string, e: string, selfId: string | null) =>
    allocs.filter((a) => a.pool_id === pool && live(a) && a.id !== selfId && overlaps(a, s, e)).reduce((t, a) => t + a.units, 0);

  const calendar = (args: Record<string, unknown>) => {
    if (opts.calendarReply) return opts.calendarReply;
    const b = bookings.find((x) => x.id === args.p_booking_id)!;
    const prev = { starts_at: b.starts_at, ends_at: b.ends_at };
    b.starts_at = String(args.p_starts_at);
    b.ends_at = String(args.p_ends_at);
    return { ok: true, already: false, previous_starts_at: prev.starts_at, previous_ends_at: prev.ends_at, starts_at: b.starts_at, ends_at: b.ends_at };
  };

  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    if (name === INQUIRY_RESCHEDULE_RPC) {
      if (opts.missingRpc) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return serial(() => {
        const snapshot = allocs.map((a) => ({ ...a }));
        const bSnap = bookings.map((b) => ({ ...b }));
        const restore = () => {
          allocs.splice(0, allocs.length, ...snapshot);
          bookings.splice(0, bookings.length, ...bSnap);
        };
        const b = bookings.find((x) => x.id === args.p_booking_id && x.tenant_id === args.p_tenant_id);
        if (!b) return { data: { ok: false, reason: "not_found" }, error: null };
        const s = String(args.p_starts_at);
        const e = String(args.p_ends_at);
        const prefix = inquiryResourcesPrefix(b.source_inquiry_id!);
        const mine = allocs.filter(
          (a) => a.tenant_id === b.tenant_id && a.operation_key.startsWith(prefix) && a.order_line_id == null && live(a) && ms(a.starts_at) === ms(b.starts_at) && ms(a.ends_at) === ms(b.ends_at),
        );
        for (const a of mine) {
          if (usedExcept(a.pool_id, s, e, a.id) + a.units > units) {
            restore();
            return { data: { ok: false, reason: "sold_out", failed_pool_id: a.pool_id }, error: null };
          }
          a.starts_at = s;
          a.ends_at = e;
          a.operation_key = String(args.p_resources_key);
        }
        const reply = calendar(args);
        if (reply.ok !== true) {
          restore();
          return { data: { ...reply, moved_resource_allocations: 0 }, error: null };
        }
        return { data: { ...reply, moved_resource_allocations: mine.length }, error: null };
      });
    }
    if (name === "reschedule_booking_set") return serial(() => ({ data: calendar(args), error: null }));
    if (name === "reserve_resource_set_v2") {
      return serial(() => {
        const cap = args.p_capacity as Array<{ pool_id: string; starts_at: string; ends_at: string; units: number }>;
        for (const c of cap) {
          if (usedExcept(c.pool_id, c.starts_at, c.ends_at, null) + c.units > units) {
            return { data: { ok: false, reason: "sold_out", failed_pool_id: c.pool_id }, error: null };
          }
        }
        const ids = cap.map((c) => {
          const id = `a${++n}`;
          allocs.push({ id, tenant_id: "t1", pool_id: c.pool_id, operation_key: String(args.p_operation_key), state: "hold", starts_at: c.starts_at, ends_at: c.ends_at, order_line_id: null, units: c.units });
          return id;
        });
        return { data: { ok: true, allocation_ids: ids, hold_ids: [] }, error: null };
      });
    }
    if (name === "commit_capacity" || name === "release_capacity") {
      for (const id of args.p_allocation_ids as string[]) {
        const a = allocs.find((x) => x.id === id);
        if (a) a.state = name === "commit_capacity" ? "committed" : "released";
      }
      return { data: { ok: true, committed: 0, released: 0, already_released: 0 }, error: null };
    }
    return { data: null, error: { code: "XX", message: `unexpected rpc ${name}` } };
  };

  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const rows = (): Record<string, unknown>[] =>
      table === "agency_bookings" ? bookings : table === "capacity_allocations" ? allocs : table === "capacity_pools" ? [{ id: "room", tenant_id: "t1" }] : [];
    const settle = () => ({ data: rows().filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r })), error: null });
    const q = {
      select: () => q,
      order: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      like: (c: string, p: string) => (filters.push((r) => String(r[c]).startsWith(p.replace(/%$/, ""))), q),
      maybeSingle: async () => ({ data: settle().data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve(settle()),
    };
    return q;
  };

  /** A confirmed orderless request booking holding the one-unit room for its window. */
  const book = (id: string, inquiryId: string, startsAt: string, endsAt: string) => {
    bookings.push({ id, tenant_id: "t1", order_id: null, source_inquiry_id: inquiryId, starts_at: startsAt, ends_at: endsAt });
    allocs.push({
      id: `a${++n}`,
      tenant_id: "t1",
      pool_id: "room",
      operation_key: inquiryResourcesKey(inquiryId, { startsAt, endsAt }),
      state: "committed",
      starts_at: startsAt,
      ends_at: endsAt,
      order_line_id: null,
      units: 1,
    });
  };

  return { admin: { rpc, from } as never, bookings, allocs, calls, book };
}

// A day 60 days out (UTC), so the fixture never drifts into the past.
const DAY = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const T = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;
const move = (admin: never, bookingId: string, startsAt: string, endsAt: string) =>
  rescheduleBooking(admin, { tenantId: "t1", bookingId, newStartsAt: startsAt, newEndsAt: endsAt, actorUserId: "u1" });
const liveIn = (allocs: Alloc[], s: string, e: string) => allocs.filter((a) => a.state !== "released" && overlaps(a, s, e));

test("TUL-1480: an overlapping move on a one-unit room succeeds (its own old window is not 'taken')", async () => {
  const db = fakeDb();
  db.book("A", "inqA", T("15:00"), T("16:00"));
  const r = await move(db.admin, "A", T("15:30"), T("16:30"));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(db.calls, [INQUIRY_RESCHEDULE_RPC], "one call: resources and calendar together");
  const live = db.allocs.filter((a) => a.state !== "released");
  assert.equal(live.length, 1, "the room is held once, never twice");
  assert.equal(live[0].starts_at, T("15:30"));
  assert.equal(live[0].operation_key, inquiryResourcesKey("inqA", { startsAt: T("15:30"), endsAt: T("16:30") }), "re-keyed to the new window");
  assert.equal(db.bookings[0].starts_at, T("15:30"));
});

test("TUL-1480: a move onto a window another booking holds is refused and nothing moves", async () => {
  const db = fakeDb();
  db.book("A", "inqA", T("15:00"), T("16:00"));
  db.book("B", "inqB", T("17:00"), T("18:00"));
  const r = await move(db.admin, "A", T("16:30"), T("17:30"));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "sold_out");
  assert.equal(!r.ok && r.failedPoolId, "room");
  const a = db.allocs.find((x) => x.operation_key.startsWith(inquiryResourcesPrefix("inqA")))!;
  assert.equal(a.starts_at, T("15:00"), "A keeps its room at the old time");
  assert.equal(db.bookings.find((b) => b.id === "A")!.starts_at, T("15:00"));
});

test("TUL-1480 RACE: two bookings moving into the same free window: exactly one wins", async () => {
  const db = fakeDb();
  db.book("A", "inqA", T("15:00"), T("16:00"));
  db.book("B", "inqB", T("17:00"), T("18:00"));
  const [x, y] = await Promise.all([move(db.admin, "A", T("20:00"), T("21:00")), move(db.admin, "B", T("20:00"), T("21:00"))]);
  assert.equal([x, y].filter((r) => r.ok).length, 1, "exactly one winner");
  const loser = [x, y].find((r) => !r.ok)!;
  assert.equal(!loser.ok && loser.reason, "sold_out");
  assert.equal(liveIn(db.allocs, T("20:00"), T("21:00")).length, 1, "never a double booking");
  assert.equal(db.bookings.filter((b) => b.starts_at === T("20:00")).length, 1);
});

test("TUL-1480: a refused calendar write rolls the room back to the old window", async () => {
  const db = fakeDb({ calendarReply: { ok: false, reason: "slot_taken", failed_talent_id: "tal1" } });
  db.book("A", "inqA", T("15:00"), T("16:00"));
  const r = await move(db.admin, "A", T("15:30"), T("16:30"));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "slot_taken");
  assert.equal(!r.ok && r.failedTalentId, "tal1");
  const live = db.allocs.filter((a) => a.state !== "released");
  assert.equal(live.length, 1);
  assert.equal(live[0].starts_at, T("15:00"));
  assert.equal(live[0].operation_key, inquiryResourcesKey("inqA", { startsAt: T("15:00"), endsAt: T("16:00") }));
  assert.equal(db.bookings[0].starts_at, T("15:00"));
});

test("TUL-1480: an order-backed booking still goes to reschedule_booking_set (the engine moves its order lines)", async () => {
  const db = fakeDb();
  db.bookings.push({ id: "O", tenant_id: "t1", order_id: "ord1", source_inquiry_id: "inqO", starts_at: T("15:00"), ends_at: T("16:00") });
  const r = await move(db.admin, "O", T("15:30"), T("16:30"));
  assert.equal(r.ok, true);
  assert.deepEqual(db.calls, ["reschedule_booking_set"]);
});

test("TUL-1480: function not applied yet -> the old hold-first path, which refuses rather than double-books", async () => {
  const db = fakeDb({ missingRpc: true });
  db.book("A", "inqA", T("15:00"), T("16:00"));
  const overlapping = await move(db.admin, "A", T("15:30"), T("16:30"));
  assert.equal(overlapping.ok, false, "the old path cannot self-exclude: a clear refusal");
  assert.equal(!overlapping.ok && overlapping.reason, "sold_out");
  assert.ok(!db.calls.includes("reschedule_booking_set"), "the calendar never moved");
  assert.equal(db.allocs.filter((a) => a.state !== "released").length, 1);
  assert.equal(db.bookings[0].starts_at, T("15:00"));

  const clear = await move(db.admin, "A", T("18:00"), T("19:00"));
  assert.equal(clear.ok, true, "a non-overlapping move still works on the old path");
  const live = db.allocs.filter((a) => a.state !== "released");
  assert.equal(live.length, 1);
  assert.equal(live[0].starts_at, T("18:00"));
});

test("TUL-1480: any other error from the function fails closed (no fallback, nothing moved)", async () => {
  const db = fakeDb({ rpcError: { code: "57014", message: "statement timeout" } });
  db.book("A", "inqA", T("15:00"), T("16:00"));
  const r = await move(db.admin, "A", T("15:30"), T("16:30"));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "unavailable");
  assert.deepEqual(db.calls, [INQUIRY_RESCHEDULE_RPC], "a timeout may have committed: never retried on the old path");
  assert.equal(db.allocs[0].starts_at, T("15:00"));
});
