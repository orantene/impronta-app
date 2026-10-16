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
  /** Active site locale; `es` defaults the fallback to MXN. */
  locale?: string | null;
}): MarketingCurrencyPick {
  const fromUrl = normalizeDefaultCurrency(input.urlCurrency);
  if (fromUrl && isMarketingPriceCurrency(fromUrl)) return { currency: fromUrl, source: "url-param" };

  const fromCookie = normalizeDefaultCurrency(input.cookieCurrency);
  if (fromCookie && isMarketingPriceCurrency(fromCookie)) return { currency: fromCookie, source: "cookie" };

  // TUL-864: Spanish defaults to MXN, but only once the catalog can render MXN
  // (TUL-892: a currency label over USD amounts is a lie). Until then the
  // pricing page shows USD plus an approximate MX$ line.
  if (
    input.locale?.trim().toLowerCase().startsWith("es") &&
    isMarketingPriceCurrency("MXN")
  ) {
    return { currency: "MXN", source: "fallback" };
  }
  return { currency: MARKETING_FALLBACK_CURRENCY, source: "fallback" };
}
