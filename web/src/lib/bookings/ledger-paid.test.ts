import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeLedgerPaid } from "./ledger-paid";
import { PAID_AFTER_CANCEL_ATTENTION } from "@/lib/payments/paid-after-cancel-attention";

describe("summarizeLedgerPaid paidAfterCancellation", () => {
  it("flags bookings whose money-in row needs paid_after_cancellation attention", () => {
    const map = summarizeLedgerPaid([
      {
        booking_id: "b1",
        gross_amount_cents: 30000,
        status: "paid",
        provider: "stripe",
        metadata: { needs_attention: PAID_AFTER_CANCEL_ATTENTION },
        paid_at: "2026-10-01T12:00:00Z",
      },
      {
        booking_id: "b2",
        gross_amount_cents: 10000,
        status: "paid",
        provider: "manual",
        metadata: { paid_via: "cash" },
        paid_at: "2026-10-01T12:00:00Z",
      },
    ]);
    assert.equal(map.get("b1")?.paidAfterCancellation, true);
    assert.equal(map.get("b2")?.paidAfterCancellation, undefined);
    assert.equal(map.get("b1")?.paidCents, 30000);
  });
});

describe("summarizeLedgerPaid refunds", () => {
  it("counts linked refund rows as refunded, never as paid, and keeps the sale paid", () => {
    const map = summarizeLedgerPaid([
      { booking_id: "b1", gross_amount_cents: 101500, status: "paid", provider: "stripe", paid_at: "2026-10-01T12:00:00Z" },
      { booking_id: "b1", gross_amount_cents: 30000, status: "refunded", provider: "stripe", refund_of_transaction_id: "t1" },
      { booking_id: "b1", gross_amount_cents: 64824, status: "refunded", provider: "stripe", refund_of_transaction_id: "t1" },
    ]);
    assert.equal(map.get("b1")?.paidCents, 101500);
    assert.equal(map.get("b1")?.refundedCents, 94824);
  });
  it("a refunded row with no refund_of_transaction_id (an old whole-sale refund) is ignored, as before", () => {
    const map = summarizeLedgerPaid([{ booking_id: "b2", gross_amount_cents: 5000, status: "refunded", provider: "stripe" }]);
    assert.equal(map.get("b2"), undefined);
  });
});
