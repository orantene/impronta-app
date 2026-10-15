import { test } from "node:test";
import assert from "node:assert/strict";

import { effectiveBookingStatus } from "./abandoned-order";
import { deriveBookingState } from "./derive";

const now = new Date("2026-10-13T12:00:00Z");

test("failed pay-now checkout (order cancelled, unpaid) is not Confirmado", () => {
  const status = effectiveBookingStatus({ status: "confirmed", orderStatus: "cancelled", paymentStatus: "unpaid", paidCents: 0 });
  assert.equal(deriveBookingState({ kind: "booking", status, now }), "cancelled");
});

test("lapsed order (expired) is not Confirmado either", () => {
  const status = effectiveBookingStatus({ status: "confirmed", orderStatus: "expired", paymentStatus: "unpaid", paidCents: 0 });
  assert.equal(deriveBookingState({ kind: "booking", status, now }), "cancelled");
});

test("money safety: a paid or partly paid booking stays confirmed", () => {
  assert.equal(effectiveBookingStatus({ status: "confirmed", orderStatus: "cancelled", paymentStatus: "paid", paidCents: 0 }), "confirmed");
  assert.equal(effectiveBookingStatus({ status: "confirmed", orderStatus: "cancelled", paymentStatus: "unpaid", paidCents: 500 }), "confirmed");
});

test("live orders and other statuses are untouched", () => {
  assert.equal(effectiveBookingStatus({ status: "confirmed", orderStatus: "pending_payment", paymentStatus: "unpaid", paidCents: 0 }), "confirmed");
  assert.equal(effectiveBookingStatus({ status: "confirmed", orderStatus: null, paymentStatus: "unpaid", paidCents: 0 }), "confirmed");
  assert.equal(effectiveBookingStatus({ status: "completed", orderStatus: "cancelled", paymentStatus: "unpaid", paidCents: 0 }), "completed");
});
