import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

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
