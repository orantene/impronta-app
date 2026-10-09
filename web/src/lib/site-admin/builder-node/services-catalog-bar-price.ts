import type { TalentOffering } from "@/lib/talent/offerings-types";
import { publicBarPriceLabel, publicCatalogPriceLabel } from "@/lib/talent/public-price-format";

/**
 * F6 (Phase 0): the price the selection bar shows for a row picked straight
 * from the catalog. A quote-priced offering has no amount, and the bar used to
 * print it as $0.00; it now says it is quoted. A "from" ladder says so too.
 * TUL-516: shared public formatter (min cents, lowercase desde, Consultar).
 */
export function catalogBarPriceLabel(
  item: Pick<TalentOffering, "priceDisplay" | "priceType" | "amountCents" | "currency" | "variants">,
  locale: string,
): string {
  return publicBarPriceLabel(item, locale);
}

/**
 * The one-line price a menu row shows ("desde $120 por uña", "desde $650",
 * "$900 MXN", "A cotizar", "Bajo consulta"). The in-chat service list reuses it so
 * the per-unit, "from" and quote labels never disagree with the menu.
 */
export function catalogRowPriceText(
  item: Pick<
    TalentOffering,
    "visibility" | "priceDisplay" | "priceType" | "amountCents" | "currency" | "variants" | "attributes"
  >,
  locale: string,
): string {
  return publicCatalogPriceLabel(item, locale);
}
