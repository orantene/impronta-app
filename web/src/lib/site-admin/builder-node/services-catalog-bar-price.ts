import type { TalentOffering } from "@/lib/talent/offerings-types";
import { formatMoney } from "@/lib/talent/offerings-money";
import {
  catalogRowMinCents,
  catalogRowShowsFrom,
  offeringPriceUnit,
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
  const es = locale.toLowerCase().startsWith("es");
  const minCents = catalogRowMinCents(item);
  if (item.priceDisplay === "quote" || item.priceType === "custom" || minCents == null) {
    return es ? "A cotizar" : "Quote";
  }
  // TUL-533 / GRK-064: never paint "$0 MXN" on the public bar.
  if (minCents <= 0) return es ? "Consultar" : "Ask";
  const money = formatMoney(minCents, item.currency, locale);
  return catalogRowShowsFrom(item) ? `${es ? "Desde" : "From"} ${money}` : money;
}

/**
 * The one-line price a menu row shows ("Desde $120 por uña", "Desde $650",
 * "$900", "A cotizar", "Bajo consulta"). The in-chat service list reuses it so
 * the per-unit, "from" and quote labels never disagree with the menu.
 */
export function catalogRowPriceText(
  item: Pick<
    TalentOffering,
    "visibility" | "priceDisplay" | "priceType" | "amountCents" | "currency" | "variants" | "attributes"
  >,
  locale: string,
): string {
  const es = locale.toLowerCase().startsWith("es");
  const onRequest = item.visibility === "on_request";
  const quote = item.priceDisplay === "quote" || item.priceType === "custom" || item.amountCents == null;
  const minCents = catalogRowMinCents(item);
  if (onRequest) return es ? "Bajo consulta" : "On request";
  if (quote || minCents == null) return es ? "A cotizar" : "Quote";
  // TUL-533 / GRK-064: zero-priced public rows say Consultar / Ask.
  if (minCents <= 0) return es ? "Consultar" : "Ask";
  const money = formatMoney(minCents, item.currency, locale);
  const unit = offeringPriceUnit(item.attributes, locale);
  if (unit) return `${es ? "Desde" : "From"} ${money} ${es ? "por" : "per"} ${unit}`;
  return catalogRowShowsFrom(item) ? `${es ? "Desde" : "From"} ${money}` : money;
}
