/**
 * Load-path money: agency total preferred; talent leg charge is the fallback
 * when agency_bookings is missing/zero (RLS or QA seeds).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAgencyBookingPayment } from "./load-map";

describe("agenda load money fallback contract", () => {
  it("treats leg charge as unpaid due when agency total is absent", () => {
    const now = new Date("2026-09-23T09:50:00-05:00");
    const payment = mapAgencyBookingPayment({
      agencyStatus: "confirmed",
      talentBookingStatus: "confirmed",
      agency: { payment_status: "unpaid", total_client_revenue: 85000 },
      paidCents: 0,
      latestTxStatus: null,
      linkOpen: false,
      now,
      startsAt: "2026-09-23T10:00:00-05:00",
    });
    assert.equal(payment, "due");
  });

  it("stays none when both agency and implied totals are zero", () => {
    const now = new Date("2026-09-23T09:50:00-05:00");
    const payment = mapAgencyBookingPayment({
      agencyStatus: "confirmed",
      talentBookingStatus: "confirmed",
      agency: { payment_status: "unpaid", total_client_revenue: 0 },
      paidCents: 0,
      latestTxStatus: null,
      linkOpen: false,
      now,
      startsAt: "2026-09-23T10:00:00-05:00",
    });
    assert.equal(payment, "none");
  });
});
