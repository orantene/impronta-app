/**
 * Locale-aware aria-labels for public site-header chrome.
 *
 * Freeform + classic variants previously hard-coded English (`Primary`,
 * `Saved`, `Your inquiry`, `Menu`) on every ES talent site. Editorial-split
 * already localized the same strings for its right-zone actions — keep one
 * source so screen readers and the visible chrome stay aligned.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export type SiteHeaderChromeAria = {
  /** `<nav>` landmark (Primary → Principal). */
  primaryNav: string;
  /** Favorites / saved heart control. */
  saved: string;
  /** Inquiry bag control. */
  inquiry: string;
  /** Mobile burger toggle. */
  menu: string;
};

export function siteHeaderChromeAria(
  locale: string | null | undefined,
): SiteHeaderChromeAria {
  return {
    primaryNav: pickLocale(locale, { en: "Primary", es: "Principal" }),
    saved: pickLocale(locale, { en: "Saved", es: "Guardados" }),
    inquiry: pickLocale(locale, { en: "Your inquiry", es: "Tu solicitud" }),
    menu: pickLocale(locale, { en: "Menu", es: "Menú" }),
  };
}
