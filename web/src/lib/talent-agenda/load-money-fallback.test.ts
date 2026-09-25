/**
 * Load-path money: agency total preferred; talent leg charge is the fallback
 * when agency_bookings is missing/zero. Talent session RLS cannot read those
 * tables — loadTalentAgenda elevates via service role for booking ids already
 * scoped by talent_bookings.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("load elevates commercial money joins via service role after talent_bookings scope", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/talent-agenda/load.ts"), "utf8");
    assert.match(src, /createServiceRoleClient/);
    assert.match(src, /moneyDb/);
    assert.match(src, /agency_bookings/);
    assert.match(src, /booking_talent/);
  });
});
