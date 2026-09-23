import assert from "node:assert/strict";
import { test } from "node:test";

import { enrichBookingFromReservation } from "./reservation-convert";

/**
 * D-MSG-312 / D-MSG-413: the one-talent-one-time exclusion
 * (`talent_bookings_no_overlap`, SQLSTATE 23P01) must reach the caller as a
 * REASON it can branch on. Convert rolls the booking back on this reason.
 *
 * D-MSG-413: a Messages pick-time hold (no reservation stamp) must still
 * write the mirror so the exclusion can protect it — option (a).
 */
const INQUIRY = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const OFFERING = "33333333-3333-4333-8333-333333333333";
const HOLD = "44444444-4444-4444-8444-444444444444";
const TALENT = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

const STAMP = {
  v: 1,
  offering_id: OFFERING,
  starts_at: "2026-10-01T10:00:00.000Z",
  ends_at: "2026-10-01T11:00:00.000Z",
  timezone: "America/Cancun",
  mode: "request",
};

const HOLD_ROW = {
  id: HOLD,
  talent_profile_id: TALENT,
  tenant_id: "t1",
  starts_at: "2026-10-02T14:00:00.000Z",
  ends_at: "2026-10-02T15:00:00.000Z",
  title: "Client pick",
  expires_at: "2099-01-01T00:00:00.000Z",
  created_at: "2026-10-01T00:00:00.000Z",
};

function stampClient(overlap: boolean) {
  const table = (name: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (name === "inquiries") {
            return {
              data: {
                id: INQUIRY,
                tenant_id: "t1",
                source_context: { reservation: STAMP },
                event_timezone: "America/Cancun",
              } as Row,
              error: null,
            };
          }
          if (name === "talent_offerings") {
            return { data: { id: OFFERING, talent_profile_id: "tp1", title: "Session", tenant_id: "t1" } as Row, error: null };
          }
          if (name === "talent_bookings") return { data: null, error: null };
          return { data: null, error: null };
        },
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    }),
    insert: async () =>
      overlap
        ? { error: { code: "23P01", message: 'conflicting key value violates exclusion constraint "talent_bookings_no_overlap"' } }
        : { error: null },
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }),
  });
  return { from: (name: string) => table(name) } as never;
}

function holdOnlyClient(overlap: boolean) {
  let inserted: Row | null = null;
  const table = (name: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (name === "inquiries") {
            return {
              data: {
                id: INQUIRY,
                tenant_id: "t1",
                source_context: {}, // no reservation stamp — Messages pick-time hole
                event_timezone: "America/Mexico_City",
              } as Row,
              error: null,
            };
          }
          if (name === "talent_bookings") return { data: null, error: null };
          return { data: null, error: null };
        },
        order: () => ({
          limit: async () => {
            if (name === "talent_holds") return { data: [HOLD_ROW], error: null };
            return { data: [], error: null };
          },
        }),
      }),
    }),
    insert: async (row: Row) => {
      if (overlap) {
        return { error: { code: "23P01", message: 'conflicting key value violates exclusion constraint "talent_bookings_no_overlap"' } };
      }
      inserted = row;
      return { error: null };
    },
    update: () => ({
      eq: async (_col: string, id: string) => {
        assert.equal(id, BOOKING);
        return { error: null };
      },
    }),
    delete: () => ({
      eq: () => ({
        select: async () => ({ data: [{ id: HOLD }], error: null }),
      }),
    }),
  });
  return {
    from: (name: string) => table(name),
    _inserted: () => inserted,
  } as never as { from: (n: string) => unknown; _inserted: () => Row | null };
}

test("an overlapping mirror insert returns reason talent_double_booked, never a bare ok:false", async () => {
  const res = await enrichBookingFromReservation(stampClient(true), {
    inquiryId: INQUIRY,
    bookingId: BOOKING,
    actorUserId: null,
  });
  assert.equal(res.ok, false, "the exclusion violation must refuse; an ok result means the insert was never reached");
  assert.equal((res as { reason?: string }).reason, "talent_double_booked");
  assert.match((res as { error: string }).error, /already booked/i);
});

test("a live hold with no reservation stamp still writes the talent_bookings mirror (D-MSG-413)", async () => {
  const client = holdOnlyClient(false);
  const res = await enrichBookingFromReservation(client as never, {
    inquiryId: INQUIRY,
    bookingId: BOOKING,
    actorUserId: null,
  });
  assert.equal(res.ok, true);
  assert.equal((res as { applied?: boolean }).applied, true);
  const row = client._inserted();
  assert.ok(row, "mirror insert must run when the only window is a live hold");
  assert.equal(row.talent_profile_id, TALENT);
  assert.equal(row.inquiry_id, INQUIRY);
  assert.equal(row.starts_at, "2026-10-02T14:00:00.000Z");
  assert.equal(row.ends_at, "2026-10-02T15:00:00.000Z");
});

test("a live hold that overlaps an existing booking refuses talent_double_booked (D-MSG-413)", async () => {
  const res = await enrichBookingFromReservation(holdOnlyClient(true) as never, {
    inquiryId: INQUIRY,
    bookingId: BOOKING,
    actorUserId: null,
  });
  assert.equal(res.ok, false);
  assert.equal((res as { reason?: string }).reason, "talent_double_booked");
});

test("neither stamp nor hold is a no-op (M0), never a silent booking mirror skip with applied true", async () => {
  const table = (name: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (name === "inquiries") {
            return { data: { id: INQUIRY, tenant_id: "t1", source_context: {}, event_timezone: null } as Row, error: null };
          }
          return { data: null, error: null };
        },
        order: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
    }),
    insert: async () => {
      throw new Error("must not insert a mirror without a window");
    },
  });
  const res = await enrichBookingFromReservation({ from: (n: string) => table(n) } as never, {
    inquiryId: INQUIRY,
    bookingId: BOOKING,
  });
  assert.deepEqual(res, { ok: true, applied: false });
});
