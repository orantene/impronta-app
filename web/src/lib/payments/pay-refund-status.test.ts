import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePaidLinkDisplayStatus } from "./pay-refund-status";

test("paid link stays paid when neither order nor booking is refunded", () => {
  assert.equal(resolvePaidLinkDisplayStatus({ orderStatus: "paid", bookingPaymentStatus: "paid" }), "paid");
  assert.equal(resolvePaidLinkDisplayStatus({ orderStatus: "fulfilled", bookingPaymentStatus: null }), "paid");
  assert.equal(resolvePaidLinkDisplayStatus({ orderStatus: null, bookingPaymentStatus: null }), "paid");
});

test("order status refunded wins even when booking is unset", () => {
  assert.equal(resolvePaidLinkDisplayStatus({ orderStatus: "refunded", bookingPaymentStatus: null }), "refunded");
});

test("booking payment_status refunded covers legacy links whose order was never stamped", () => {
  assert.equal(resolvePaidLinkDisplayStatus({ orderStatus: "paid", bookingPaymentStatus: "refunded" }), "refunded");
});
