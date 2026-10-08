/**
 * Pure receipt payment-row builder. Mirrors confirmationTotalRows in
 * booking-confirmation-pdf.ts so the client receipt can show the same fee
 * breakdown when the booking's commission snapshot sums to the amount paid.
 * No DB / PDF IO — unit-testable in isolation.
 */

import type { FeeLine } from "@/lib/billing/processing-fee-payer";
import { validClientFeeLines } from "@/lib/payments/fee-lines-payload";

const PDF_FEE_LABELS: Record<string, string> = {
  service_subtotal: "Service",
  base_reservation_fee: "Reservation fee",
  platform_fee: "Platform fee (1.5%)",
  processing_fee: "Card processing",
};

function fmtMoneyExact(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export type ReceiptPaymentRow = {
  label: string;
  value: string;
  strong?: boolean;
};

/**
 * Fee breakdown rows (when lines sum to amount paid) plus the Amount paid
 * total. When fee lines are absent or do not sum, only Amount paid is returned
 * — same gross-only fallback the receipt used before fee lines landed.
 */
export function receiptPaymentRows(input: {
  feeLines?: readonly FeeLine[] | null;
  currency: string;
  amountPaidCents: number;
}): ReceiptPaymentRow[] {
  const currency = input.currency || "USD";
  const lines = validClientFeeLines(input.feeLines, input.amountPaidCents);
  const rows: ReceiptPaymentRow[] = [];
  if (lines.length) {
    for (const l of lines) {
      if (l.code === "total_charged") continue;
      rows.push({
        label: PDF_FEE_LABELS[l.code] ?? l.code,
        value: fmtMoneyExact(l.cents, currency),
      });
    }
  }
  rows.push({
    label: "Amount paid",
    value: fmtMoneyExact(input.amountPaidCents, currency),
    strong: true,
  });
  return rows;
}

/** True when the receipt should show the non-refundable fees note. */
export function receiptHasFeeBreakdown(
  feeLines: readonly FeeLine[] | null | undefined,
  amountPaidCents: number,
): boolean {
  return validClientFeeLines(feeLines, amountPaidCents).length > 0;
}
