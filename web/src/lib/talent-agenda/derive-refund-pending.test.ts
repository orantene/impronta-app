import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { derivePaymentState } from "./derive";

describe("derivePaymentState refund pending after cancel (Track D7)", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("returns refund_pending even when the booking is cancelled", () => {
    assert.equal(
      derivePaymentState({
        booking: "cancelled",
        refundPending: true,
        paidCents: 30000,
        totalCents: 30000,
        now,
      }),
      "refund_pending",
    );
  });

  it("still returns none for cancelled without refund pending", () => {
    assert.equal(
      derivePaymentState({
        booking: "cancelled",
        paidCents: 0,
        totalCents: 30000,
        now,
      }),
      "none",
    );
  });
});
