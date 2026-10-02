/**
 * Unit tests for the booking-confirmation PDF generator. Pure function — no
 * DB/Stripe. Verifies it emits a valid, non-trivial PDF and survives a
 * multi-page line-item list.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { confirmationTotalRows, generateBookingConfirmationPdf } from "./booking-confirmation-pdf";

describe("generateBookingConfirmationPdf", () => {
  it("produces a valid, non-trivial PDF for the canonical booking", async () => {
    const bytes = await generateBookingConfirmationPdf({
      confirmationNumber: "TUL-12345",
      paidAtISO: "2026-05-29T12:00:00.000Z",
      clientName: "Test Client",
      workspaceName: "Impronta",
      currency: "MXN",
      lineItems: [
        { label: "Talent booking", talentName: "Tina", units: 1, unitPriceCents: 200_000, totalPriceCents: 200_000 },
        { label: "Talent booking", talentName: "Mara", units: 1, unitPriceCents: 200_000, totalPriceCents: 200_000 },
      ],
      subtotalCents: 400_000,
      serviceFeeCents: 12_000, // 3% client surcharge
      totalPaidCents: 412_000,
      eventLabel: "Editorial shoot",
    });
    assert.ok(bytes.length > 500, "PDF should be non-trivial");
    // PDF magic bytes: %PDF
    assert.equal(bytes[0], 0x25);
    assert.equal(bytes[1], 0x50);
    assert.equal(bytes[2], 0x44);
    assert.equal(bytes[3], 0x46);
  });

  it("handles a long line-item list across pages without throwing", async () => {
    const lineItems = Array.from({ length: 40 }, (_, i) => ({
      label: `Service ${i + 1}`,
      units: 2,
      unitPriceCents: 50_000,
      totalPriceCents: 100_000,
    }));
    const bytes = await generateBookingConfirmationPdf({
      confirmationNumber: "TUL-99999",
      paidAtISO: "2026-05-29T12:00:00.000Z",
      clientName: "Big Client",
      workspaceName: "Agency",
      currency: "USD",
      lineItems,
      subtotalCents: 4_000_000,
      serviceFeeCents: 120_000,
      totalPaidCents: 4_120_000,
    });
    assert.ok(bytes.length > 1000);
  });

  it("falls back to the Tulala brand and renders without an event label", async () => {
    const bytes = await generateBookingConfirmationPdf({
      confirmationNumber: "TUL-1",
      paidAtISO: "2026-05-29T00:00:00.000Z",
      clientName: "Solo Client",
      workspaceName: "Studio",
      currency: "EUR",
      lineItems: [{ label: "Day rate", units: 1, unitPriceCents: 100_000, totalPriceCents: 100_000 }],
      subtotalCents: 100_000,
      serviceFeeCents: 3_000,
      totalPaidCents: 103_000,
    });
    assert.ok(bytes.length > 500);
  });
});

describe("confirmationTotalRows", () => {
  const base = { currency: "USD", subtotalCents: 10_000, serviceFeeCents: 150, totalPaidCents: 10_150 };
  it("shows the fee breakdown when it sums exactly to the amount paid", () => {
    const rows = confirmationTotalRows({
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
    ]);
  });
  it("includes card processing when the client pays it", () => {
    const rows = confirmationTotalRows({
      ...base,
      totalPaidCents: 10_480,
      feeLines: [
        { code: "service_subtotal", cents: 10_000 },
        { code: "platform_fee", cents: 150 },
        { code: "processing_fee", cents: 330 },
        { code: "total_charged", cents: 10_480 },
      ],
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[2].label, "Card processing");
  });
  it("falls back to Subtotal and Service fee when lines are absent or do not sum", () => {
    const fallback = [
      { label: "Subtotal", value: "$100" },
      { label: "Service fee", value: "$2" },
    ];
    assert.deepEqual(confirmationTotalRows({ ...base, feeLines: null }), fallback);
    assert.deepEqual(
      confirmationTotalRows({
        ...base,
        feeLines: [
          { code: "service_subtotal", cents: 9_000 },
          { code: "total_charged", cents: 10_150 },
        ],
      }),
      fallback,
    );
  });
});
