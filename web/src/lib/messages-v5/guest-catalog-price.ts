/** The dock's price label: the row's OWN currency (TUL-1272 item 10). Older rows without one stay USD. */
import { formatOrderMoney } from "@/lib/orders/money-format";

export function guestRowPriceLabel(row: { amountCents?: number | null; currency?: string | null }): string | null {
  if (row.amountCents == null || !(row.amountCents > 0)) return null;
  return formatOrderMoney(row.amountCents, row.currency?.trim() || "USD");
}
