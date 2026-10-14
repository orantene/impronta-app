/**
 * Pure marketing-currency choice. `resolveCurrency` is the request-wired
 * wrapper; this is the part a test can break.
 *
 * Marketing prices are USD. A visitor can still pin MXN (or anything else
 * in the list) with `?currency=` or the footer cookie. We do not guess from
 * IP: that path labeled the page "Showing prices in MXN" while the catalog
 * fell back to USD amounts, so a Mexico visitor saw a lying chip.
 */

import {
  normalizeDefaultCurrency,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";

export const MARKETING_FALLBACK_CURRENCY: DefaultCurrencyCode = "USD";

/**
 * Currencies the marketing price source can actually render. The catalog has
 * USD rows only today; add a code here when its `product_*` price rows (or an
 * approved conversion display) exist. Anything else resolves to USD so the
 * picker value and the displayed amounts always agree (TUL-892).
 */
export const MARKETING_PRICE_CURRENCIES: readonly DefaultCurrencyCode[] = ["USD"];

export function isMarketingPriceCurrency(
  code: string | null | undefined,
): code is DefaultCurrencyCode {
  return (
    typeof code === "string" &&
    (MARKETING_PRICE_CURRENCIES as readonly string[]).includes(code.toUpperCase())
  );
}

/** Any input (cookie, URL, locale default such as BRL) -> a renderable currency. */
export function coerceMarketingCurrency(
  code: string | null | undefined,
): DefaultCurrencyCode {
  return isMarketingPriceCurrency(code)
    ? (code!.toUpperCase() as DefaultCurrencyCode)
    : MARKETING_FALLBACK_CURRENCY;
}

export type MarketingCurrencySource = "url-param" | "cookie" | "fallback";

export type MarketingCurrencyPick = {
  currency: DefaultCurrencyCode;
  source: MarketingCurrencySource;
};

export function pickMarketingCurrency(input: {
  urlCurrency?: string | null;
  cookieCurrency?: string | null;
}): MarketingCurrencyPick {
  const fromUrl = normalizeDefaultCurrency(input.urlCurrency);
  if (fromUrl && isMarketingPriceCurrency(fromUrl)) return { currency: fromUrl, source: "url-param" };

  const fromCookie = normalizeDefaultCurrency(input.cookieCurrency);
  if (fromCookie && isMarketingPriceCurrency(fromCookie)) return { currency: fromCookie, source: "cookie" };

  return { currency: MARKETING_FALLBACK_CURRENCY, source: "fallback" };
}
