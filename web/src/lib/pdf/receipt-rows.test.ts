/**
 * Unit tests for receipt payment rows — pure helper, no DB/PDF.
 * Mirrors booking-confirmation-pdf.test.ts coverage of confirmationTotalRows.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { receiptHasFeeBreakdown, receiptPaymentRows } from "./receipt-rows";

describe("receiptPaymentRows", () => {
  const base = { currency: "USD", amountPaidCents: 10_150 };

  it("shows the fee breakdown when it sums exactly to the amount paid", () => {
    const rows = receiptPaymentRows({
      ...base,
      feeLines: [
        { code: "service_subtotal", cents: 10_000 },
        { code: "platform_fee", cents: 150 },
        { code: "total_charged", cents: 10_150 },
      ],
    });
    assert.deepEqual(rows, [
      { label: "Service", value: "$100.00" },
      { label: "Platform fee (1.5%)", value: "$1.50" },
      { label: "Amount paid", value: "$101.50", strong: true },
    ]);
  });

  it("includes card processing and reservation fee when present", () => {
    const rows = receiptPaymentRows({
      currency: "USD",
      amountPaidCents: 10_980,
      feeLines: [
        { code: "service_subtotal", cents: 10_000 },
        { code: "base_reservation_fee", cents: 500 },
        { code: "platform_fee", cents: 150 },
        { code: "processing_fee", cents: 330 },
        { code: "total_charged", cents: 10_980 },
      ],
    });
    assert.equal(rows.length, 5);
    assert.equal(rows[0].label, "Service");
    assert.equal(rows[1].label, "Reservation fee");
    assert.equal(rows[2].label, "Platform fee (1.5%)");
    assert.equal(rows[3].label, "Card processing");
    assert.deepEqual(rows[4], { label: "Amount paid", value: "$109.80", strong: true });
  });

  it("falls back to Amount paid only when lines are absent or do not sum", () => {
    const onlyTotal = [{ label: "Amount paid", value: "$101.50", strong: true }];
    assert.deepEqual(receiptPaymentRows({ ...base, feeLines: null }), onlyTotal);
    assert.deepEqual(receiptPaymentRows({ ...base, feeLines: undefined }), onlyTotal);
    assert.deepEqual(
      receiptPaymentRows({
        ...base,
        feeLines: [
          { code: "service_subtotal", cents: 9_000 },
          { code: "total_charged", cents: 10_150 },
        ],
      }),
      onlyTotal,
    );
  });
});

describe("receiptHasFeeBreakdown", () => {
  it("is true only when validClientFeeLines would return lines", () => {
    assert.equal(
      receiptHasFeeBreakdown(
        [
          { code: "service_subtotal", cents: 10_000 },
          { code: "platform_fee", cents: 150 },
          { code: "total_charged", cents: 10_150 },
        ],
        10_150,
      ),
      true,
    );
    assert.equal(receiptHasFeeBreakdown(null, 10_150), false);
    assert.equal(
      receiptHasFeeBreakdown(
        [
          { code: "service_subtotal", cents: 9_000 },
          { code: "total_charged", cents: 10_150 },
        ],
        10_150,
      ),
      false,
    );
  });
});
