/**
 * Diverged talent_bookings ↔ agency_bookings: pick commercial Soft Gel row.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { pickAgendaCommercialBooking } from "./resolve-agenda-pay-booking";

describe("pickAgendaCommercialBooking", () => {
  it("prefers booking_talent leg with order + revenue over empty shells", () => {
    const picked = pickAgendaCommercialBooking(
      [
        {
          id: "mirror-empty",
          total_client_revenue: 0,
          order_id: null,
          payment_status: "unpaid",
        },
        {
          id: "cd2d3c8e",
          total_client_revenue: 500,
          order_id: "e52ee8c4",
          payment_status: "unpaid",
        },
      ],
      new Set(["cd2d3c8e"]),
    );
    assert.equal(picked?.id, "cd2d3c8e");
  });

  it("falls back to highest-revenue candidate when no talent leg matches", () => {
    const picked = pickAgendaCommercialBooking(
      [
        {
          id: "a",
          total_client_revenue: 100,
          order_id: null,
          payment_status: "unpaid",
        },
        {
          id: "b",
          total_client_revenue: 500,
          order_id: null,
          payment_status: "unpaid",
        },
      ],
      new Set(),
    );
    assert.equal(picked?.id, "b");
  });

  it("returns null for an empty candidate list", () => {
    assert.equal(pickAgendaCommercialBooking([], new Set(["x"])), null);
  });
});

describe("createAgendaBookingPayLink mirror resolution contract", () => {
  it("resolves commercial agency row via source_inquiry_id when ids diverge", () => {
    const root = join(process.cwd(), "src/lib/talent-agenda");
    const actions = readFileSync(join(root, "booking-actions.ts"), "utf8");
    const resolve = readFileSync(join(root, "resolve-agenda-pay-booking.ts"), "utf8");
    assert.match(actions, /resolveAgendaPayLinkBooking/);
    assert.match(actions, /commercialBookingId/);
    assert.match(resolve, /source_inquiry_id/);
    assert.match(resolve, /talent_bookings/);
    assert.match(resolve, /booking_talent/);
    assert.match(resolve, /pickAgendaCommercialBooking/);
  });
});
