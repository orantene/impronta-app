/**
 * Safe-exchange reschedule — pure behaviour with a fake admin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rescheduleBooking } from "./reschedule-booking";

type Row = Record<string, unknown>;

function fakeAdmin(store: {
  agency_bookings: Row[];
  talent_bookings: Row[];
  talent_holds: Row[];
  holdFail?: "slot_taken" | null;
}) {
  const tables: Record<string, Row[]> = {
    agency_bookings: store.agency_bookings,
    talent_bookings: store.talent_bookings,
    talent_holds: store.talent_holds,
  };
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const filters: Array<(r: Row) => boolean> = [];
      let pendingUpdate: Row | null = null;
      let pendingInsert: Row | null = null;
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
        update(patch: Row) {
          pendingUpdate = patch;
          return api;
        },
        insert(row: Row) {
          pendingInsert = row;
          return api;
        },
        async maybeSingle() {
          const matched = rows.filter((r) => filters.every((f) => f(r)));
          return { data: matched[0] ?? null, error: null };
        },
        async single() {
          if (pendingInsert) {
            if (table === "talent_holds" && store.holdFail === "slot_taken") {
              return {
                data: null,
                error: { code: "23P01", message: "talent_holds_firm_no_overlap" },
              };
            }
            const id = `hold_${store.talent_holds.length + 1}`;
            const row = { id, ...pendingInsert };
            rows.push(row);
            pendingInsert = null;
            return { data: { id }, error: null };
          }
          return { data: null, error: { message: "no row" } };
        },
        then(resolve: (v: unknown) => void) {
          // PostgREST builder awaited without .single — update/delete paths.
          if (pendingUpdate) {
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            for (const r of matched) Object.assign(r, pendingUpdate);
            pendingUpdate = null;
            resolve({ data: matched, error: null });
            return;
          }
          if (table === "talent_holds" && filters.length) {
            // delete().eq("id", ...)
            const before = rows.length;
            const keep = rows.filter((r) => !filters.every((f) => f(r)));
            rows.length = 0;
            rows.push(...keep);
            resolve({ data: before === keep.length ? null : [{}], error: null });
            return;
          }
          const matched = rows.filter((r) => filters.every((f) => f(r)));
          resolve({ data: matched, error: null });
        },
        delete() {
          // releaseReservationHold awaits `.delete().eq("id", …)` — return the
          // same chainable builder, not a bare promise.
          return api;
        },
      };
      // Make the builder thenable for `await admin.from(...).update(...).eq...`
      return api;
    },
  };
}

test("moves agency + talent times after holding the destination", async () => {
  const store = {
    agency_bookings: [
      {
        id: "b1",
        tenant_id: "t1",
        status: "confirmed",
        starts_at: "2026-10-01T10:00:00.000Z",
        ends_at: "2026-10-01T11:00:00.000Z",
        source_inquiry_id: "inq1",
      },
    ],
    talent_bookings: [
      {
        id: "tb1",
        tenant_id: "t1",
        inquiry_id: "inq1",
        talent_profile_id: "tal1",
        title: "Cut",
        status: "confirmed",
        starts_at: "2026-10-01T10:00:00.000Z",
        ends_at: "2026-10-01T11:00:00.000Z",
      },
    ],
    talent_holds: [] as Row[],
  };
  const r = await rescheduleBooking(fakeAdmin(store) as never, {
    tenantId: "t1",
    bookingId: "b1",
    newStartsAt: "2026-10-01T14:00:00.000Z",
    newEndsAt: "2026-10-01T15:00:00.000Z",
    actorUserId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(store.agency_bookings[0].starts_at, "2026-10-01T14:00:00.000Z");
  assert.equal(store.talent_bookings[0].starts_at, "2026-10-01T14:00:00.000Z");
  assert.equal(store.talent_holds.length, 0, "exchange hold is released");
});

test("refuses when the destination hold hits the firm-overlap constraint", async () => {
  const store = {
    agency_bookings: [
      {
        id: "b1",
        tenant_id: "t1",
        status: "confirmed",
        starts_at: "2026-10-01T10:00:00.000Z",
        ends_at: "2026-10-01T11:00:00.000Z",
        source_inquiry_id: "inq1",
      },
    ],
    talent_bookings: [
      {
        id: "tb1",
        tenant_id: "t1",
        inquiry_id: "inq1",
        talent_profile_id: "tal1",
        title: "Cut",
        status: "confirmed",
        starts_at: "2026-10-01T10:00:00.000Z",
        ends_at: "2026-10-01T11:00:00.000Z",
      },
    ],
    talent_holds: [] as Row[],
    holdFail: "slot_taken" as const,
  };
  const r = await rescheduleBooking(fakeAdmin(store) as never, {
    tenantId: "t1",
    bookingId: "b1",
    newStartsAt: "2026-10-01T14:00:00.000Z",
    newEndsAt: "2026-10-01T15:00:00.000Z",
    actorUserId: "u1",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "slot_taken");
  assert.equal(
    store.agency_bookings[0].starts_at,
    "2026-10-01T10:00:00.000Z",
    "origin stays put",
  );
});

test("shell-only bookings (no talent mirror) still move timestamps", async () => {
  const store = {
    agency_bookings: [
      {
        id: "b2",
        tenant_id: "t1",
        status: "confirmed",
        starts_at: "2026-10-01T10:00:00.000Z",
        ends_at: null,
        source_inquiry_id: null,
      },
    ],
    talent_bookings: [] as Row[],
    talent_holds: [] as Row[],
  };
  const r = await rescheduleBooking(fakeAdmin(store) as never, {
    tenantId: "t1",
    bookingId: "b2",
    newStartsAt: "2026-10-02T09:00:00.000Z",
    newEndsAt: null,
    actorUserId: "u1",
  });
  assert.equal(r.ok, true);
  assert.equal(store.agency_bookings[0].starts_at, "2026-10-02T09:00:00.000Z");
});
