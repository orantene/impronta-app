import type { TalentOffering } from "@/lib/talent/offerings-types";
import { formatMoney } from "@/lib/talent/offerings-money";
import {
  catalogRowMinCents,
  catalogRowShowsFrom,
} from "@/components/public-booking/catalog-booking-logic";

/**
 * F6 (Phase 0): the price the selection bar shows for a row picked straight
 * from the catalog. A quote-priced offering has no amount, and the bar used to
 * print it as $0.00; it now says it is quoted. A "from" ladder says so too.
 */
export function catalogBarPriceLabel(
  item: Pick<TalentOffering, "priceDisplay" | "priceType" | "amountCents" | "currency" | "variants">,
  locale: string,
): string {
  const es = locale.startsWith("es");
  const minCents = catalogRowMinCents(item);
  if (item.priceDisplay === "quote" || item.priceType === "custom" || minCents == null) {
    return es ? "A cotizar" : "Quote";
  }
  const money = formatMoney(minCents, item.currency, locale);
  return catalogRowShowsFrom(item) ? `${es ? "Desde" : "From"} ${money}` : money;
}
