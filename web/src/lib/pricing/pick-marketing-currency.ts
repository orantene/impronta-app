/**
 * Pure marketing-currency choice. `resolveCurrency` is the request-wired
 * wrapper; this is the part a test can break.
 *
 * Marketing prices are USD, except on the Spanish site (TUL-864: profiles there
 * show MXN, so a USD pricing page disagreed) where the default is MXN. The
 * locale is the visitor's own chosen language, not a guess from IP. A visitor can still pin MXN (or anything else
 * in the list) with `?currency=` or the footer cookie. We do not guess from
 * IP: that path labeled the page "Showing prices in MXN" while the catalog
 * fell back to USD amounts, so a Mexico visitor saw a lying chip.
 */

import {
  normalizeDefaultCurrency,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";

export const MARKETING_FALLBACK_CURRENCY: DefaultCurrencyCode = "USD";

export type MarketingCurrencySource = "url-param" | "cookie" | "fallback";

export type MarketingCurrencyPick = {
  currency: DefaultCurrencyCode;
  source: MarketingCurrencySource;
};

export function pickMarketingCurrency(input: {
  urlCurrency?: string | null;
  cookieCurrency?: string | null;
  /** Active site locale; `es` defaults the fallback to MXN. */
  locale?: string | null;
}): MarketingCurrencyPick {
  const fromUrl = normalizeDefaultCurrency(input.urlCurrency);
  if (fromUrl) return { currency: fromUrl, source: "url-param" };

  const fromCookie = normalizeDefaultCurrency(input.cookieCurrency);
  if (fromCookie) return { currency: fromCookie, source: "cookie" };

  if (input.locale?.trim().toLowerCase().startsWith("es")) {
    return { currency: "MXN", source: "fallback" };
  }
  return { currency: MARKETING_FALLBACK_CURRENCY, source: "fallback" };
}
