import assert from "node:assert/strict";
import { test } from "node:test";

import { enrichBookingFromReservation } from "./reservation-convert";

/**
 * D-MSG-312: the one-talent-one-time exclusion (`talent_bookings_no_overlap`,
 * SQLSTATE 23P01) must reach the caller as a REASON it can branch on, not as a
 * sentence it has to pattern-match and not as a logged shrug. `convertToBooking`
 * rolls its booking back on this reason; if it ever became a plain `ok:false`
 * again, the caller would keep a booking the talent's calendar does not have.
 */
const INQUIRY = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

const OFFERING = "33333333-3333-4333-8333-333333333333";
const STAMP = {
  v: 1,
  offering_id: OFFERING,
  starts_at: "2026-10-01T10:00:00.000Z",
  ends_at: "2026-10-01T11:00:00.000Z",
  timezone: "America/Cancun",
  mode: "request",
};

function client(overlap: boolean) {
  const table = (name: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (name === "inquiries") return { data: { id: INQUIRY, tenant_id: "t1", source_context: { reservation: STAMP } } as Row, error: null };
          if (name === "talent_offerings") return { data: { id: OFFERING, talent_profile_id: "tp1", title: "Session", tenant_id: "t1" } as Row, error: null };
          return { data: null, error: null };
        },
      }),
    }),
    insert: async () =>
      overlap
        ? { error: { code: "23P01", message: 'conflicting key value violates exclusion constraint "talent_bookings_no_overlap"' } }
        : { error: null },
    update: () => ({ eq: async () => ({ error: null }) }),
  });
  return { from: (name: string) => table(name) } as never;
}

test("an overlapping mirror insert returns reason talent_double_booked, never a bare ok:false", async () => {
  const res = await enrichBookingFromReservation(client(true), { inquiryId: INQUIRY, bookingId: BOOKING, actorUserId: null });
  assert.equal(res.ok, false, "the exclusion violation must refuse; an ok result means the insert was never reached");
  assert.equal((res as { reason?: string }).reason, "talent_double_booked");
  assert.match((res as { error: string }).error, /already booked/i);
});
