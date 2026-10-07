/**
 * The brand line in the reader's language, for the default browser-tab title
 * and the social-card titles that inherit it (TUL-146). The root layout used
 * the English line on every screen, so a Spanish dashboard showed
 * "Tulala · Sell what you do, not what you ship" in the tab.
 *
 * Kept next to the other brand constants and free of React so a test can pin
 * it; `TulalaBrandLockup` carries the same two lines for the logo.
 */
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const BRAND_TAGLINE_ES = "Vende lo que haces, no lo que envías";

export function brandTaglineFor(locale: string | null | undefined): string {
  return locale === "es" ? BRAND_TAGLINE_ES : PLATFORM_BRAND.tagline;
}

/** `Tulala · <line>`: the default title when a page sets none. */
export function defaultTabTitle(locale: string | null | undefined): string {
  return `${PLATFORM_BRAND.name} · ${brandTaglineFor(locale)}`;
}
