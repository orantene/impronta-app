import test from "node:test";
import assert from "node:assert/strict";

import {
  applyReservationToIntent,
  parseReservationStamp,
  reservationDateFromStamp,
  RESERVATION_STAMP_VERSION,
} from "./reservation-intent";
import { enrichBookingFromReservation } from "./reservation-convert";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

const OFFERING = "11111111-1111-4111-8111-111111111111";

const STAMP = {
  v: RESERVATION_STAMP_VERSION,
  offering_id: OFFERING,
  starts_at: "2026-03-10T15:00:00.000Z",
  ends_at: "2026-03-10T15:30:00.000Z",
  timezone: "America/Cancun",
  duration_minutes: 30,
  mode: "request" as const,
};

test("parseReservationStamp reads the versioned reservation node", () => {
  const parsed = parseReservationStamp({ reservation: STAMP });
  assert.ok(parsed);
  assert.equal(parsed.offering_id, OFFERING);
  assert.equal(parsed.mode, "request");
  assert.equal(parsed.duration_minutes, 30);
});

test("garbage or incomplete stamps fail closed", () => {
  assert.equal(parseReservationStamp(null), null);
  assert.equal(parseReservationStamp({ reservation: { v: 1 } }), null);
  assert.equal(
    parseReservationStamp({
      reservation: { ...STAMP, starts_at: "2026-03-10T16:00:00.000Z", ends_at: "2026-03-10T15:00:00.000Z" },
    }),
    null,
  );
});

test("reservationDateFromStamp is exact civil time in the snapshot timezone", () => {
  const date = reservationDateFromStamp(STAMP);
  assert.equal(date.status, "exact");
  assert.equal(date.event_date, "2026-03-10");
  assert.equal(date.start_time, "10:00");
});

test("applyReservationToIntent claims offering_request and does not use not_sure", () => {
  const intent = applyReservationToIntent(
    {
      source: "public_talent_profile",
      requester: { name: "Ana", email: "ana@example.com" },
      date: { status: "not_sure" },
      source_context: {},
    } as InquiryIntent,
    STAMP,
  );
  assert.equal(intent.source, "offering_request");
  assert.equal(intent.date?.status, "exact");
  assert.equal(intent.date?.event_date, "2026-03-10");
  assert.equal((intent.source_context?.reservation as { offering_id: string }).offering_id, OFFERING);
});

test("enrichBookingFromReservation no-ops without a stamp (M0 unchanged)", async () => {
  const calls: string[] = [];
  const admin = {
    from(table: string) {
      calls.push(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === "inquiries" ? { id: "i1", tenant_id: "t1", source_context: {} } : null,
              error: null,
            }),
          }),
        }),
      };
    },
  };
  const r = await enrichBookingFromReservation(admin as never, { inquiryId: "i1", bookingId: "b1" });
  assert.deepEqual(r, { ok: true, applied: false });
  assert.ok(!calls.includes("agency_bookings"));
  assert.ok(!calls.includes("talent_bookings"));
});

test("enrichBookingFromReservation stamps times, inserts the mirror, deletes the hold", async () => {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const deletes: string[] = [];

  const admin = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === "inquiries") {
                return {
                  data: {
                    id: "i1",
                    tenant_id: "t1",
                    source_context: { reservation: { ...STAMP, hold_id: "h1" } },
                  },
                  error: null,
                };
              }
              if (table === "talent_bookings") return { data: null, error: null };
              if (table === "talent_offerings") {
                return {
                  data: { id: OFFERING, talent_profile_id: "tp1", title: "Corte", tenant_id: "t1" },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updates.push({ table, patch });
            return { error: null };
          },
        }),
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return { then: async (fn: (v: { error: null }) => unknown) => fn({ error: null }) };
        },
        delete: () => ({
          eq: (col: string, id: string) => {
            deletes.push(`${table}:${col}=${id}`);
            return {
              select: async () => {
                deletes.push(`${table}:select`);
                return { data: [{ id: "h1" }], error: null };
              },
              then: async (fn: (v: { error: null }) => unknown) => fn({ error: null }),
            };
          },
        }),
      };
    },
  };

  const r = await enrichBookingFromReservation(admin as never, {
    inquiryId: "i1",
    bookingId: "b1",
    actorUserId: "u1",
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.applied, true);
  assert.deepEqual(updates[0]?.patch, {
    starts_at: STAMP.starts_at,
    ends_at: STAMP.ends_at,
    timezone: STAMP.timezone,
  });
  assert.equal(inserts[0]?.table, "talent_bookings");
  assert.equal(inserts[0]?.row.inquiry_id, "i1");
  assert.equal(inserts[0]?.row.talent_profile_id, "tp1");
  assert.ok(deletes.some((d) => d.startsWith("talent_holds:")));
});
