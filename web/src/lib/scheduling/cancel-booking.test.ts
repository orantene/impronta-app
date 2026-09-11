import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cancelBookingSet, refundableCentsFromPolicy } from "./cancel-booking";

test("inside the free-cancel window the paid amount is refundable", () => {
  assert.equal(
    refundableCentsFromPolicy({
      paidCents: 5000,
      cancelFreeHours: 24,
      startsAt: "2026-10-05T10:00:00.000Z",
      nowMs: Date.parse("2026-10-03T10:00:00.000Z"),
    }),
    5000,
  );
});

test("after the window the policy keeps the money", () => {
  assert.equal(
    refundableCentsFromPolicy({
      paidCents: 5000,
      cancelFreeHours: 24,
      startsAt: "2026-10-05T10:00:00.000Z",
      nowMs: Date.parse("2026-10-05T09:00:00.000Z"),
    }),
    0,
  );
});

test("a short operation key is invalid and a missing booking is not_found", async () => {
  const short = await cancelBookingSet(
    { from: () => ({}), rpc: async () => ({ data: { ok: true }, error: null }) },
    { tenantId: "t1", bookingId: "b1", operationKey: "short", reason: "x", by: "staff" },
  );
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.reason, "invalid");

  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    rpc: async () => ({ data: { ok: true }, error: null }),
  };
  const missing = await cancelBookingSet(admin, {
    tenantId: "t1",
    bookingId: "b1",
    operationKey: "cancel-booking-1",
    reason: "changed",
    by: "staff",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "not_found");
});

test("cancel_booking_set releases allocations through order_lines", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231218000_cancel_booking_set.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public.cancel_booking_set/);
  assert.match(sql, /order_line_id/);
  assert.match(sql, /release_capacity/);
});
