import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapAgencyBookingPayment, openInquiriesWithoutBooking } from "./load-map";

// TUL-360: instant-book guest booking = thread inquiry + booking. The agenda
// must show the booking (with its payment state), not a second "request".

const NOW = new Date("2026-10-08T12:00:00Z");
const STARTS = "2026-10-20T15:00:00Z";

describe("openInquiriesWithoutBooking", () => {
  it("drops the thread inquiry of an instant-book booking", () => {
    const out = openInquiriesWithoutBooking([{ id: "inq-instant" }], {
      bookings: [{ inquiry_id: "inq-instant" }],
      holds: [],
    });
    assert.deepEqual(out, []);
  });

  it("drops an inquiry that is the thread of a hold", () => {
    const out = openInquiriesWithoutBooking([{ id: "inq-h" }], {
      bookings: [],
      holds: [{ inquiry_id: "inq-h" }],
    });
    assert.deepEqual(out, []);
  });

  it("keeps a pure inquiry as an inquiry", () => {
    const out = openInquiriesWithoutBooking([{ id: "inq-pure" }, { id: "inq-instant" }], {
      bookings: [{ inquiry_id: "inq-instant" }, { inquiry_id: null }],
      holds: [{ inquiry_id: null }],
    });
    assert.deepEqual(out, [{ id: "inq-pure" }]);
  });
});

describe("instant-book booking payment state on the agenda", () => {
  const base = {
    agencyStatus: "confirmed",
    talentBookingStatus: "confirmed",
    paidCents: 0,
    latestTxStatus: "pending",
    linkOpen: true,
    now: NOW,
    startsAt: STARTS,
  };

  it("pending payment shows a pending-payment state (awaiting or checking)", () => {
    const state = mapAgencyBookingPayment({
      ...base,
      agency: { payment_status: "unpaid", total_client_revenue: 50 },
    });
    assert.ok(state === "awaiting" || state === "checking", `got ${state}`);
  });

  it("paid shows as paid", () => {
    const state = mapAgencyBookingPayment({
      ...base,
      paidCents: 5000,
      latestTxStatus: "paid",
      linkOpen: false,
      agency: { payment_status: "paid", total_client_revenue: 50 },
    });
    assert.equal(state, "paid");
  });
});
