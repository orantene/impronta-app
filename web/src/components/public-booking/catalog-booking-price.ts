import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

import { catalogRowMinCents, catalogRowShowsFrom } from "./catalog-booking-logic";

/** Quote / custom / missing amount — never paint as $0 (AUD-006). */
export function catalogIsQuote(
  detail: Pick<OfferingRequestDetail, "priceDisplay" | "priceType" | "amountCents">,
): boolean {
  return (
    detail.priceDisplay === "quote" ||
    detail.priceType === "custom" ||
    detail.amountCents == null
  );
}

export function catalogPriceLabel(
  detail: Pick<OfferingRequestDetail, "priceDisplay" | "priceType" | "amountCents" | "currency">,
  cents: number,
  locale: string,
  money: (cents: number, currency: string) => string,
): string {
  if (catalogIsQuote(detail)) {
    return locale.toLowerCase().startsWith("es") ? "A cotizar" : "Quote";
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

/**
 * Footer total. Until a required option is picked it is the summary's "From"
 * floor plus extras, so it never disagrees with the line above it (the stale
 * offering base can sit above the cheapest option).
 */
export function catalogSheetFooterTotal(
  detail: Pick<OfferingRequestDetail, "amountCents" | "variants" | "addOns">,
  variantId: string | null,
  addOnIds: readonly string[],
): { cents: number; from: boolean } {
  const variants = detail.variants ?? [];
  const extrasCents = (detail.addOns ?? [])
    .filter((a) => addOnIds.includes(a.id))
    .reduce((sum, a) => sum + a.amountCents, 0);
  const picked = variants.find((v) => v.id === variantId) ?? null;
  if (variants.length === 0 || picked) {
    return { cents: (picked?.amountCents ?? detail.amountCents ?? 0) + extrasCents, from: false };
  }
  return { cents: (catalogSheetSummaryCents(detail, null) ?? 0) + extrasCents, from: true };
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
