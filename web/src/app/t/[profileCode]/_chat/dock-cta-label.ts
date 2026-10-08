/**
 * Guest dock row button labels. PURE. Same model as the services catalog
 * (deriveOfferingCta): the label follows the booking mode, in the site locale.
 */
import type { ItemCategory } from "@/lib/messages-v5/items-picker";
import { offeringDockCtaLabel } from "@/lib/talent/offering-cta-derivation";
import type { OfferingCtaKind } from "@/lib/talent/offerings-types";

/** Talent service row. No derived CTA reads as an inquiry ("Ask"). */
export function dockServiceCtaLabel(cta: OfferingCtaKind | null | undefined, locale: string): string {
  return offeringDockCtaLabel(cta ?? "request", locale);
}

/**
 * Book / request / buy labels must open the catalog booking sheet (times +
 * holds), not only prefill Ask. Quote and bare inquiry stay in the composer.
 */
export function dockServiceOpensBookingSheet(
  cta: OfferingCtaKind | null | undefined,
  offeringId: string | null | undefined,
): boolean {
  if (!offeringId || offeringId === "default-custom-quote") return false;
  return cta === "book_now" || cta === "request_to_book" || cta === "buy_now";
}

/** Bookable storefront kinds (service / class) never read "Buy now". */
export function dockStorefrontCtaLabel(category: ItemCategory, locale: string, fallback: string): string {
  if (category === "service" || category === "class") return offeringDockCtaLabel("book_now", locale);
  return fallback;
}
