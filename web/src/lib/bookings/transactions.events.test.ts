import { test } from "node:test";
import assert from "node:assert/strict";

import { describeTransactionTransitionEvent } from "@/lib/bookings/transaction-events";

test("payout-side failures emit payout.failed", () => {
  const event = describeTransactionTransitionEvent({
    toStatus: "failed",
    fromStatus: "payout_pending",
    grossAmountCents: 15_000,
    netAmountCents: 12_375,
    currency: "USD",
    provider: "manual",
    providerReference: null,
    failureReason: "bank_rejected",
    refundTransactionId: null,
  });

  assert.equal(event.eventType, "payout.failed");
  assert.deepEqual(event.payload, { reason: "bank_rejected" });
});

test("payment-side failures keep payment.failed", () => {
  const event = describeTransactionTransitionEvent({
    toStatus: "failed",
    fromStatus: "pending",
    grossAmountCents: 15_000,
    netAmountCents: 12_375,
    currency: "USD",
    provider: "manual",
    providerReference: null,
    failureReason: "payment_timeout",
    refundTransactionId: null,
  });

  assert.equal(event.eventType, "payment.failed");
  assert.deepEqual(event.payload, { reason: "payment_timeout" });
});
