/** The dock's price label: the row's OWN currency (TUL-1272 item 10). Older rows without one stay USD. */
import { formatRecordMoney } from "@/lib/messages-v5/record-money";

export function guestRowPriceLabel(row: { amountCents?: number | null; currency?: string | null }): string | null {
  if (row.amountCents == null || !(row.amountCents > 0)) return null;
  return formatRecordMoney(row.amountCents, row.currency?.trim() || "USD");
}
