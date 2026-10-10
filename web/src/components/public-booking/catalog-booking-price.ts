import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import {
  catalogRowMinCents,
  catalogRowShowsFrom,
  isPublicUnpriced,
  publicConsultLabel,
  publicQuoteLabel,
} from "@/lib/talent/public-price-format";

/** Quote / custom / missing / zero amount — never paint as $0 (AUD-006 / TUL-516). */
export function catalogIsQuote(
  detail: Pick<OfferingRequestDetail, "priceDisplay" | "priceType" | "amountCents">,
): boolean {
  return isPublicUnpriced(detail.amountCents, detail.priceDisplay, detail.priceType);
}

export function catalogPriceLabel(
  detail: Pick<OfferingRequestDetail, "priceDisplay" | "priceType" | "amountCents" | "currency">,
  cents: number,
  locale: string,
  money: (cents: number, currency: string) => string,
): string {
  if (detail.priceDisplay === "quote" || detail.priceType === "custom" || detail.amountCents == null) {
    return publicQuoteLabel(locale);
  }
  if (cents <= 0 || detail.amountCents <= 0) {
    return publicConsultLabel(locale);
  }
  return money(cents, detail.currency);
}

type SheetPriceDetail = Pick<
  OfferingRequestDetail,
  "priceDisplay" | "priceType" | "amountCents" | "variants"
>;

/**
 * TUL-516 / was TUL-496: sheet summary money must match the catalog "From"
 * floor until an option is picked, then follow that option (not a stale
 * offering.amountCents that can sit above the cheapest variant).
 */
export function catalogSheetSummaryCents(
  detail: Pick<OfferingRequestDetail, "amountCents" | "variants">,
  variantId: string | null,
): number | null {
  const variant = (detail.variants ?? []).find((v) => v.id === variantId) ?? null;
  if (variant) return variant.amountCents ?? detail.amountCents ?? null;
  return catalogRowMinCents(detail);
}

/** Caption above the sheet summary price ("From" until an option is chosen). */
export function catalogSheetSummaryCaption(
  detail: SheetPriceDetail,
  variantId: string | null,
  locale: string,
): string {
  const es = locale.toLowerCase().startsWith("es");
  if (catalogIsQuote(detail)) return es ? "Precio" : "Price";
  const picked = Boolean(variantId && (detail.variants ?? []).some((v) => v.id === variantId));
  if (!picked && catalogRowShowsFrom(detail)) return es ? "Desde" : "From";
  return es ? "Precio base" : "Base price";
}
