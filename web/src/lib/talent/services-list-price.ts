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
): string {
  const state = listPriceState(item);
  if (state === "quote") return quoted;
  if (state === "unset" || item.amountCents == null) return noPrice ?? quoted;
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(item.amountCents / 100);
  return `$${amount} ${item.currency}`;
}
