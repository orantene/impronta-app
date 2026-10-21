import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readConfirmations, setOwnConfirmation } from "./assignment-confirmation";

type Err = { code?: string; message: string } | null;
type Row = Record<string, unknown>;

/** A typed fake: tables of rows, an optional error per table, upserts recorded. */
function fakeAdmin(tables: Record<string, Row[]>, errors: Record<string, Err> = {}) {
  const upserts: Row[] = [];
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: errors[table] ?? null }),
      upsert: async (row: Row) => {
        if (errors[table]) return { error: errors[table] };
        upserts.push(row);
        return { error: null };
      },
      then: (resolve: (v: { data: Row[]; error: Err }) => unknown) => resolve({ data: rows(), error: errors[table] ?? null }),
    };
    return q;
  };
  return { admin: { from } as unknown as SupabaseClient, upserts };
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
