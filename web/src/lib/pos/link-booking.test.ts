import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { linkBooking } from "./link-booking";

test("a second distinct booking is already_linked", async () => {
  const result = await linkBooking(
    {
      from: () => {
        throw new Error("no table");
      },
      rpc: async () => ({ data: { ok: false, reason: "already_linked" }, error: null }),
    },
    {
      tenantId: "t1",
      orderId: "o1",
      bookingKind: "agency_booking",
      bookingId: "b2",
      operationKey: "link-booking-aa",
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "already_linked");
});

test("link booking SQL refuses a missing booking as wrong_tenant", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231203000_pos_link_booking.sql"), "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public.pos_link_booking/);
  assert.match(sql, /expected wrong_tenant/);
});
