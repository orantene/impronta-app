import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readConfirmations, readOwnSeat, setOwnConfirmation } from "./assignment-confirmation";

type Err = { code?: string; message: string } | null;
type Row = Record<string, unknown>;

type RpcResult = { data: unknown; error: Err };
type FakeOpts = { rpc?: (name: string, args: Row) => RpcResult; onUpsert?: (tables: Record<string, Row[]>) => void };

/** A typed fake: tables of rows, an optional error per table, upserts, deletes and rpc calls recorded. By default the RPC is missing (PGRST202), so the old path runs. */
function fakeAdmin(tables: Record<string, Row[]>, errors: Record<string, Err> = {}, opts: FakeOpts = {}) {
  const upserts: Row[] = [];
  const deletes: Array<Array<[string, unknown]>> = [];
  const rpcs: Array<{ name: string; args: Row }> = [];
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let del = false;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      delete: () => {
        del = true;
        return q;
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      maybeSingle: async () => ({ data: rows()[0] ? { ...rows()[0] } : null, error: errors[table] ?? null }),
      upsert: async (row: Row) => {
        if (errors[table]) return { error: errors[table] };
        upserts.push(row);
        opts.onUpsert?.(tables);
        return { error: null };
      },
      then: (resolve: (v: { data: Row[]; error: Err }) => unknown) => {
        if (del) {
          deletes.push([...filters]);
          return resolve({ data: [], error: errors[table] ?? null });
        }
        return resolve({ data: rows(), error: errors[table] ?? null });
      },
    };
    return q;
  };
  const rpc = async (name: string, args: Row): Promise<RpcResult> => {
    rpcs.push({ name, args });
    return opts.rpc ? opts.rpc(name, args) : { data: null, error: { code: "PGRST202", message: "missing" } };
  };
  return { admin: { from, rpc } as unknown as SupabaseClient, upserts, deletes, rpcs };
}

const T = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b1";

test("a confirmed and a declined row are read per assignment", async () => {
  const { admin } = fakeAdmin({
    project_assignment_confirmations: [
      { tenant_id: T, booking_id: B, booking_talent_id: "a1", talent_profile_id: "p1", status: "confirmed" },
      { tenant_id: T, booking_id: B, booking_talent_id: "a2", talent_profile_id: "p2", status: "declined" },
      { tenant_id: T, booking_id: B, booking_talent_id: "a3", talent_profile_id: "p3", status: "weird" },
    ],
  });
  const r = await readConfirmations(admin, { tenantId: T, bookingId: B });
  assert.deepEqual(r, { ok: true, byAssignment: { a1: "confirmed", a2: "declined" }, talentByAssignment: { a1: "p1", a2: "p2" } });
});

test("a missing table or column (42P01, 42703, PGRST205) means no state, not an error", async () => {
  for (const code of ["42P01", "42703", "PGRST205"]) {
    const { admin } = fakeAdmin({}, { project_assignment_confirmations: { code, message: "x" } });
    assert.deepEqual(await readConfirmations(admin, { tenantId: T, bookingId: B }), { ok: false, reason: "no_state" });
  }
});

test("any other read error is unknown, which is never treated as confirmed", async () => {
  const { admin } = fakeAdmin({}, { project_assignment_confirmations: { code: "57014", message: "timeout" } });
  assert.deepEqual(await readConfirmations(admin, { tenantId: T, bookingId: B }), { ok: false, reason: "unknown" });
});

const mine = "00000000-0000-0000-0000-0000000000c1";
const theirs = "00000000-0000-0000-0000-0000000000c2";
const seat = { id: "a1", tenant_id: T, booking_id: B, talent_profile_id: mine };

test("a person confirms their OWN seat; the write carries the seat's tenant, booking and person", async () => {
  const { admin, upserts } = fakeAdmin({ talent_profiles: [{ id: mine, user_id: "u1" }], booking_talent: [seat] });
  const r = await setOwnConfirmation(admin, { userId: "u1", assignmentId: "a1", status: "confirmed" });
  assert.deepEqual(r, { ok: true });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].booking_talent_id, "a1");
  assert.equal(upserts[0].talent_profile_id, mine);
  assert.equal(upserts[0].tenant_id, T);
  assert.equal(upserts[0].status, "confirmed");
});

test("a person cannot set someone else's state", async () => {
  const { admin, upserts } = fakeAdmin({
    talent_profiles: [{ id: theirs, user_id: "u2" }],
    booking_talent: [seat],
  });
  const r = await setOwnConfirmation(admin, { userId: "u1", assignmentId: "a1", status: "confirmed" });
  assert.deepEqual(r, { ok: false, reason: "not_yours" });
  assert.equal(upserts.length, 0);
});

test("a seat with no profile behind it can be confirmed by nobody", async () => {
  const { admin, upserts } = fakeAdmin({
    talent_profiles: [{ id: mine, user_id: "u1" }],
    booking_talent: [{ ...seat, talent_profile_id: null }],
  });
  assert.deepEqual(await setOwnConfirmation(admin, { userId: "u1", assignmentId: "a1", status: "declined" }), { ok: false, reason: "not_yours" });
  assert.equal(upserts.length, 0);
});

test("a bad status, an unreadable seat or a failed write fails closed", async () => {
  const base = { talent_profiles: [{ id: mine, user_id: "u1" }], booking_talent: [seat] };
  const a = fakeAdmin(base);
  assert.deepEqual(await setOwnConfirmation(a.admin, { userId: "u1", assignmentId: "a1", status: "maybe" as never }), { ok: false, reason: "invalid" });
  const b = fakeAdmin(base, { booking_talent: { code: "57014", message: "x" } });
  assert.deepEqual(await setOwnConfirmation(b.admin, { userId: "u1", assignmentId: "a1", status: "confirmed" }), { ok: false, reason: "unavailable" });
  const c = fakeAdmin(base, { project_assignment_confirmations: { code: "42P01", message: "x" } });
  assert.deepEqual(await setOwnConfirmation(c.admin, { userId: "u1", assignmentId: "a1", status: "confirmed" }), { ok: false, reason: "unavailable" });
  assert.equal(c.upserts.length, 0);
});

test("answering twice writes the same row (idempotent upsert on the seat)", async () => {
  const { admin, upserts } = fakeAdmin({ talent_profiles: [{ id: mine, user_id: "u1" }], booking_talent: [seat] });
  await setOwnConfirmation(admin, { userId: "u1", assignmentId: "a1", status: "confirmed" });
  await setOwnConfirmation(admin, { userId: "u1", assignmentId: "a1", status: "confirmed" });
  assert.equal(upserts.length, 2);
  assert.deepEqual({ ...upserts[0], responded_at: 0 }, { ...upserts[1], responded_at: 0 });
});

test("TUL-1606: readOwnSeat returns only the signed-in person's own seat and their own answer", async () => {
  const tables = {
    agency_bookings: [{ id: B, order_id: null, source_inquiry_id: "inq1", calendar_lane: null, title: "Boda" }],
    talent_profiles: [{ id: "p-me", user_id: "u1" }, { id: "p-other", user_id: "u2" }],
    booking_talent: [
      { id: "s-other", booking_id: B, talent_profile_id: "p-other", role_label: "Cook" },
      { id: "s-me", booking_id: B, talent_profile_id: "p-me", role_label: "Waiter" },
    ],
    project_assignment_confirmations: [{ booking_talent_id: "s-me", talent_profile_id: "p-me", status: "confirmed" }],
  };
  const { admin } = fakeAdmin(tables);
  assert.deepEqual(await readOwnSeat(admin, { userId: "u1", bookingId: B }), { assignmentId: "s-me", roleLabel: "Waiter", status: "confirmed" });
  assert.equal(await readOwnSeat(admin, { userId: "u3", bookingId: B }), null);
  // an answer left by the previous person on the same seat does not count
  const stale = fakeAdmin({ ...tables, project_assignment_confirmations: [{ booking_talent_id: "s-me", talent_profile_id: "p-before", status: "confirmed" }] });
  assert.equal((await readOwnSeat(stale.admin, { userId: "u1", bookingId: B }))?.status, "awaiting");
  // migration not applied: no card at all (every click would fail); any other answers error fails closed too
  for (const code of ["42P01", "42703", "PGRST205", "57014"]) {
    const bad = fakeAdmin(tables, { project_assignment_confirmations: { code, message: "x" } });
    assert.equal(await readOwnSeat(bad.admin, { userId: "u1", bookingId: B }), null, code);
  }
  // no answer row yet (table present): awaiting
  const none = fakeAdmin({ ...tables, project_assignment_confirmations: [] });
  assert.equal((await readOwnSeat(none.admin, { userId: "u1", bookingId: B }))?.status, "awaiting");
  // not a project: a counter-sale shell, or a missing booking, shows no card
  const shell = fakeAdmin({ ...tables, agency_bookings: [{ id: B, order_id: "o1", source_inquiry_id: null, calendar_lane: null, title: "x" }] });
  assert.equal(await readOwnSeat(shell.admin, { userId: "u1", bookingId: B }), null);
  const lane = fakeAdmin({ ...tables, agency_bookings: [{ id: B, order_id: null, source_inquiry_id: "inq1", calendar_lane: "order", title: "x" }] });
  assert.equal(await readOwnSeat(lane.admin, { userId: "u1", bookingId: B }), null);
  assert.equal(await readOwnSeat(fakeAdmin({ ...tables, agency_bookings: [] }).admin, { userId: "u1", bookingId: B }), null);
  // a failed seat read is no seat
  const broken = fakeAdmin(tables, { booking_talent: { code: "57014", message: "x" } });
  assert.equal(await readOwnSeat(broken.admin, { userId: "u1", bookingId: B }), null);
});

test("with the guarded RPC, a late write by the previous person is refused and changes nothing", async () => {
  const { admin, upserts, rpcs } = fakeAdmin(
    { talent_profiles: [{ id: mine, user_id: "u1" }], booking_talent: [seat] },
    {},
    { rpc: () => ({ data: "stale", error: null }) },
  );
  assert.deepEqual(await setOwnConfirmation(admin, { userId: "u1", assignmentId: "a1", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.equal(rpcs.length, 1);
  assert.equal(upserts.length, 0);
});

test("with the guarded RPC, the write is one statement carrying the seat, the person and the answer", async () => {
  const { admin, upserts, rpcs } = fakeAdmin(
    { talent_profiles: [{ id: mine, user_id: "u1" }], booking_talent: [seat] },
    {},
    { rpc: () => ({ data: "ok", error: null }) },
  );
  assert.deepEqual(await setOwnConfirmation(admin, { userId: "u1", assignmentId: "a1", status: "declined" }), { ok: true });
  assert.deepEqual(rpcs, [{ name: "answer_assignment_confirmation", args: { p_seat: "a1", p_talent: mine, p_status: "declined" } }]);
  assert.equal(upserts.length, 0);
});

test("a late write by the previous person never leaves the new person's seat confirmed (fallback path)", async () => {
  // The seat is swapped to someone else between the ownership check and the write.
  const tables = { talent_profiles: [{ id: mine, user_id: "u1" }], booking_talent: [{ ...seat }] as Row[] };
  const { admin, deletes } = fakeAdmin(tables, {}, { onUpsert: (t) => void (t.booking_talent[0].talent_profile_id = theirs) });
  assert.deepEqual(await setOwnConfirmation(admin, { userId: "u1", assignmentId: "a1", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.equal(deletes.length, 1);
  assert.deepEqual(deletes[0], [
    ["booking_talent_id", "a1"],
    ["talent_profile_id", mine],
  ]);
});

test("a swapped-back person's old confirm is not revived: the read still reports it as the old person's", async () => {
  // Same seat, row written by A, seat now belongs to B: the board compares talentByAssignment with the seat's person.
  const { admin } = fakeAdmin({
    project_assignment_confirmations: [{ tenant_id: T, booking_id: B, booking_talent_id: "a1", talent_profile_id: mine, status: "confirmed" }],
  });
  const r = await readConfirmations(admin, { tenantId: T, bookingId: B });
  assert.ok(r.ok);
  if (r.ok) assert.notEqual(r.talentByAssignment.a1, theirs);
});
