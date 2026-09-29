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

/** Bookable storefront kinds (service / class) never read "Buy now". */
export function dockStorefrontCtaLabel(category: ItemCategory, locale: string, fallback: string): string {
  if (category === "service" || category === "class") return offeringDockCtaLabel("book_now", locale);
  return fallback;
}
