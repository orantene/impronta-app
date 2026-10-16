/**
 * Marketing chrome aria labels that interpolate tokens from `getMarketingCopy`.
 * Keep templates in the copy module (en/es parity); format here so callers stay thin.
 *
 * Hamburger Open/Close menu is owned by #2804 — do not re-add here.
 */
import { getMarketingCopy } from "@/lib/marketing/copy";

export function marketingShowSlideLabel(locale: string, slideIndex1Based: number): string {
  return getMarketingCopy(locale).hero.showSlide.replace("{n}", String(slideIndex1Based));
}

export function marketingReadStoryNamedLabel(locale: string, name: string): string {
  return getMarketingCopy(locale).stories.readStoryNamed.replace("{name}", name);
}
