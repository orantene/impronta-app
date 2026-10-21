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
 * USD rows only today, so MXN renders as a DISPLAY conversion of the USD price
 * (live FX, `pricing-ladders-section.tsx`), always with a "charged in USD"
 * line; if `product_*` MXN rows are added they are used as-is. Anything else
 * (BRL, ...) resolves to USD so the picker value and the displayed amounts
 * always agree (TUL-892). MXN is the Spanish-site default (TUL-864).
 */
export const MARKETING_PRICE_CURRENCIES: readonly DefaultCurrencyCode[] = ["USD", "MXN"];

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

  // TUL-864: Spanish defaults to MXN. The pricing page converts the USD price
  // for display and says it is charged in USD, so the chip never lies (TUL-892).
  if (
    input.locale?.trim().toLowerCase().startsWith("es") &&
    isMarketingPriceCurrency("MXN")
  ) {
    return { currency: "MXN", source: "fallback" };
  }
  return { currency: MARKETING_FALLBACK_CURRENCY, source: "fallback" };
}

/**
 * TUL-1817: MXN is a DISPLAY conversion of the USD catalog, so it needs a live
 * FX rate. When the rate is unavailable (`mxnRate == null`), an MXN page would
 * show USD amounts under an MXN label. Resolve to USD instead so the picker,
 * the label and the amounts agree.
 */
export function fxSafeMarketingCurrency(
  pick: MarketingCurrencyPick,
  mxnRate: number | null | undefined,
): MarketingCurrencyPick {
  if (pick.currency === "MXN" && (mxnRate == null || !Number.isFinite(mxnRate) || mxnRate <= 0)) {
    return { currency: MARKETING_FALLBACK_CURRENCY, source: "fallback" };
  }
  return pick;
}
