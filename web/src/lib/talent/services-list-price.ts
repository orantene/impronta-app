import { formatDashboardMoney } from "@/lib/money/dashboard-money-format";
import type { TalentOffering } from "@/lib/talent/offerings-types";

/**
 * The price cell on a Services list row. Three honest states, matching the
 * Services home design: a quoted item says Quoted, an item that simply has
 * no amount yet says No price yet (it needs attention), anything else shows
 * the amount.
 */
export type ListPriceState = "quote" | "unset" | "amount";

export function listPriceState(
  item: Pick<TalentOffering, "amountCents" | "priceDisplay">,
): ListPriceState {
  if (item.priceDisplay === "quote") return "quote";
  if (item.amountCents == null) return "unset";
  return "amount";
}

export function listPrice(
  item: Pick<TalentOffering, "amountCents" | "priceDisplay" | "currency">,
  quoted: string,
  noPrice?: string,
  locale: string = "en",
): string {
  const state = listPriceState(item);
  if (state === "quote") return quoted;
  if (state === "unset" || item.amountCents == null) return noPrice ?? quoted;
  // DS-17: the one dashboard money format ("$300 MXN"), whole units like before.
  return formatDashboardMoney(item.amountCents / 100, item.currency, locale, { wholeUnits: true });
}
