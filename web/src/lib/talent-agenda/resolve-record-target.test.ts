import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveRecordTarget, type RecordTargetDb } from "./resolve-record-target";

const ME = "talent-1";
const B = "11111111-1111-1111-1111-111111111111";
const ORDER = "22222222-2222-2222-2222-222222222222";
const START = "2026-10-17T15:00:00+00:00";

type Tables = Record<string, Array<Record<string, unknown>>>;

/** Tiny in-memory stand-in: filters rows by the eq() chain, returns the first. */
function fakeDb(tables: Tables): RecordTargetDb {
  return {
    from(table: string) {
      return {
        select() {
          const filters: Array<[string, string]> = [];
          const chain = {
            eq(col: string, val: string) {
              filters.push([col, val]);
              return chain;
            },
            maybeSingle() {
              const hit = (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v));
              return Promise.resolve({ data: hit ?? null });
            },
          };
          return chain;
        },
      };
    },
  } as unknown as RecordTargetDb;
}

const agency: Tables = {
  talent_bookings: [],
  agency_bookings: [{ id: B, starts_at: START, order_id: ORDER }],
  booking_talent: [{ booking_id: B, talent_profile_id: ME }],
};

test("her own manual booking resolves from talent_bookings", async () => {
  const db = fakeDb({ talent_bookings: [{ id: B, talent_profile_id: ME, starts_at: START }] });
  assert.deepEqual(await resolveRecordTarget({ supabase: db, admin: db }, ME, B), { bookingId: B, startsAt: START });
});

test("an agency booking id with no talent_bookings row still has its time (was 'Sin hora asignada')", async () => {
  const db = fakeDb(agency);
  assert.deepEqual(await resolveRecordTarget({ supabase: db, admin: db }, ME, B), { bookingId: B, startsAt: START });
});

test("the order id of an accepted offer resolves to its booking", async () => {
  const db = fakeDb(agency);
  assert.deepEqual(await resolveRecordTarget({ supabase: db, admin: db }, ME, ORDER), { bookingId: B, startsAt: START });
});

test("another talent's booking never resolves", async () => {
  const db = fakeDb(agency);
  assert.equal(await resolveRecordTarget({ supabase: db, admin: db }, "someone-else", B), null);
  assert.equal(await resolveRecordTarget({ supabase: db, admin: db }, "someone-else", ORDER), null);
});

test("a booking that really has no start stays unresolved", async () => {
  const db = fakeDb({ ...agency, agency_bookings: [{ id: B, starts_at: null, order_id: ORDER }] });
  assert.equal(await resolveRecordTarget({ supabase: db, admin: db }, ME, B), null);
});
