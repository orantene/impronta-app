/**
 * receipt-rows.ts — the paid sales the page read, shaped as the Receipts
 * screen's rows: today / yesterday / this week by the request's clock, the
 * public `/r/<code>` link when the sale has a receipt code. One shaping for
 * the counter's rail and the door's, so the two never disagree about a day.
 */

import type { PosReceiptRow } from "@/components/admin/pos";
import type { listPaidPosSales } from "@/lib/pos/sale-read";

type PaidRow = Extract<Awaited<ReturnType<typeof listPaidPosSales>>, { ok: true }>["rows"][number];

export function receiptRows(rows: readonly PaidRow[], requestedAt: Date, locale: string, receiptOrigin: string): PosReceiptRow[] {
  const startOfToday = new Date(requestedAt);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  return rows.map((row) => {
    const when = row.paidAt ? new Date(row.paidAt) : null;
    const dayKey =
      when && when.getTime() >= startOfToday.getTime() ? "today" : when && when.getTime() >= startOfYesterday.getTime() ? "yesterday" : "week";
    return {
      orderId: row.id,
      code: row.receiptCode,
      time: when && !Number.isNaN(when.getTime()) ? clock.format(when) : "",
      dayKey,
      customer: row.customerName,
      summary: row.lineLabels.join(", "),
      totalCents: row.totalCents,
      currency: row.currency,
      href: row.receiptCode && receiptOrigin ? `${receiptOrigin}/r/${row.receiptCode}` : null,
    };
  });
}
