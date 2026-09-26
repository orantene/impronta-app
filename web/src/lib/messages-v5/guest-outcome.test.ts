import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveGuestOutcomeFromMessages,
  readGuestOutcome,
  readGuestOutcomeRefundAmount,
} from "./guest-outcome";

test("declined: change_result with offerId or Offer declined summary", () => {
  assert.equal(
    readGuestOutcome({ kind: "change_result", payload: { state: "declined", summary: "Offer declined", offerId: "o1" } }),
    "declined",
  );
  assert.equal(
    readGuestOutcome({ kind: "change_result", payload: { state: "declined", summary: "Offer declined" } }),
    "declined",
  );
  assert.equal(
    readGuestOutcome({ kind: "offer_state", payload: { state: "cancelled", offerStatus: "declined", offerId: "o1" } }),
    "declined",
  );
  // A refused change request stays a change card, not the offer-declined outcome.
  assert.equal(
    readGuestOutcome({ kind: "change_result", payload: { state: "declined", summary: "Not possible" } }),
    null,
  );
});

test("pay failed: change_result failed from markFailed", () => {
  assert.equal(
    readGuestOutcome({ kind: "change_result", payload: { state: "failed", summary: "Payment failed", reason: "card_declined" } }),
    "pay_failed",
  );
});

test("refunded: payment card state or refund-only change_result", () => {
  assert.equal(
    readGuestOutcome({ kind: "payment_request", payload: { state: "refunded", amountCents: 20000, currency: "MXN" } }),
    "refunded",
  );
  assert.equal(
    readGuestOutcome({
      kind: "change_result",
      payload: { state: "sent", summary: "Refunded 18.00 USD", refundedCents: 1800, currency: "USD" },
    }),
    "refunded",
  );
  // Cancel + refund stays a cancel card, not the deposit-returned outcome.
  assert.equal(
    readGuestOutcome({
      kind: "change_result",
      payload: { state: "sent", summary: "Cancelled, refunded 18.00", refundedCents: 1800, currency: "USD" },
    }),
    null,
  );
});

test("newest outcome in the thread wins", () => {
  assert.equal(
    deriveGuestOutcomeFromMessages([
      { kind: "change_result", payload: { state: "declined", summary: "Offer declined", offerId: "o1" } },
      { kind: "change_result", payload: { state: "failed", summary: "Payment failed" } },
    ]),
    "pay_failed",
  );
});

test("refund amount is read only when the engine stamped cents", () => {
  assert.deepEqual(
    readGuestOutcomeRefundAmount({
      kind: "change_result",
      payload: { state: "sent", summary: "Refunded 18.00 USD", refundedCents: 1800, currency: "USD" },
    }),
    { cents: 1800, currency: "USD" },
  );
  assert.equal(
    readGuestOutcomeRefundAmount({ kind: "change_result", payload: { state: "declined", summary: "Offer declined" } }),
    null,
  );
});
