/**
 * The hub profile "Desde" headline (design L6): the same picker as directory
 * cards (pickHeadlinePrice), priced through displayPrice. With no live promo it
 * returns exactly the string the hub printed before.
 */

import { promoPriceText } from "@/components/promos/public/promo-badge";
import { pickHeadlinePrice } from "@/lib/directory/headline-price";
import { formatMoney } from "@/lib/talent/offerings-money";

import { displayHeadlinePrice, type DisplayPriceContext } from "./display-price";

export type HubOffering = {
  id: string;
  priceDisplay: string;
  priceType: string;
  amountCents: number | null;
  currency: string;
  isFeatured?: boolean | null;
};

export function hubHeadlinePriceText(
  offerings: readonly HubOffering[],
  promo: DisplayPriceContext | null,
  locale: string,
): string | null {
  const rows = offerings
    .filter((o) => o.priceDisplay !== "quote" && o.priceType !== "custom" && typeof o.amountCents === "number" && o.amountCents > 0)
    .map((o) => ({ id: o.id, amountCents: o.amountCents as number, currency: o.currency, priceType: o.priceType, isFeatured: o.isFeatured === true }));
  const headline = pickHeadlinePrice(rows);
  if (!headline) return null;
  if (promo && promo.promos.length > 0) {
    const p = displayHeadlinePrice(rows, promo);
    if (p?.price.hasPromo) return promoPriceText(p.price, locale);
  }
  return formatMoney(headline.amountCents, headline.currency, locale);
}
