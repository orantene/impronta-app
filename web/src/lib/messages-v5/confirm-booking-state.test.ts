import assert from "node:assert/strict";
import { test } from "node:test";

import { decideConfirmBookingState, type ConfirmBookingFacts, type ConfirmBookingState } from "./confirm-booking-state";

const base: ConfirmBookingFacts = { ownerSeller: true, offerStatus: "accepted", booking: "none", paymentRequested: false };

const TABLE: Array<[string, ConfirmBookingFacts, ConfirmBookingState]> = [
  ["accepted, no booking: ready", base, "ready"],
  ["not the owner/seller: hidden", { ...base, ownerSeller: false }, "hidden"],
  ["not the owner, even with a booking and payment: hidden", { ...base, ownerSeller: false, booking: "ours", paymentRequested: true }, "hidden"],
  ["no offer: hidden", { ...base, offerStatus: null }, "hidden"],
  ["draft offer: hidden", { ...base, offerStatus: "draft" }, "hidden"],
  ["sent offer (client has not accepted): hidden", { ...base, offerStatus: "sent" }, "hidden"],
  ["rejected offer: hidden", { ...base, offerStatus: "rejected" }, "hidden"],
  ["superseded offer: hidden", { ...base, offerStatus: "superseded" }, "hidden"],
  ["booked status with no booking row: hidden", { ...base, offerStatus: "booked" }, "hidden"],
  ["booking ours, payment not requested: retry_payment", { ...base, booking: "ours" }, "retry_payment"],
  ["booking ours, payment requested: done", { ...base, booking: "ours", paymentRequested: true }, "done"],
  ["booking ours, offer stamped booked, payment requested: done", { ...base, offerStatus: "booked", booking: "ours", paymentRequested: true }, "done"],
  ["booking ours, offer stamped booked, payment missing: retry_payment", { ...base, offerStatus: "booked", booking: "ours" }, "retry_payment"],
  ["booking ours but the offer moved on (draft): hidden", { ...base, offerStatus: "draft", booking: "ours" }, "hidden"],
  ["booking from another path: hidden (never a second payment request)", { ...base, booking: "foreign" }, "hidden"],
  ["booking from another path with a card: hidden", { ...base, booking: "foreign", paymentRequested: true }, "hidden"],
  ["payment card without a booking, accepted: ready (booking still missing)", { ...base, paymentRequested: true }, "ready"],
];

for (const [name, facts, want] of TABLE) {
  test(`confirm booking state: ${name}`, () => {
    assert.equal(decideConfirmBookingState(facts), want);
  });
}
