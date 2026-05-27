/**
 * currency-resolver.ts — server-side currency resolution for marketing
 * surfaces (Phase 2 of the Product Pricing dashboard).
 *
 * Priority order (highest wins):
 *   1. ?currency=XXX URL param (transient explicit override)
 *   2. tulala-currency cookie  (sticky explicit override set by picker)
 *   3. x-vercel-ip-country header → COUNTRY_TO_CURRENCY map
 *   4. USD fallback
 *
 * The cookie is set by the client-side CurrencyPicker when the user
 * picks an explicit currency; setting it from this resolver isn't
 * possible (server components can't write cookies). The picker also
 * navigates with `?currency=X` so the FIRST render of the new
 * selection is correct.
 *
 * Server-only: imports `next/headers` which only exists server-side.
 */

import "server-only";
import { cookies, headers } from "next/headers";
import {
  normalizeDefaultCurrency,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";
import { currencyForCountry } from "./country-currency-map";

/**
 * Public marketing default. The per-actor `DEFAULT_CURRENCY_FALLBACK`
 * (EUR) is for logged-in workspace settings, not anonymous visitors —
 * USD is the right fallback for unauthenticated marketing browsers and
 * also the only currency guaranteed to have a row in `product_prices`.
 */
const MARKETING_FALLBACK: DefaultCurrencyCode = "USD";

/** Cookie name the picker sets. Read here and only here. */
export const CURRENCY_COOKIE = "tulala-currency";

export type CurrencyResolution = {
  currency: DefaultCurrencyCode;
  source: "url-param" | "cookie" | "ip-country" | "fallback";
  /** Raw `x-vercel-ip-country` value, lowercased. Useful for debug + the
   *  picker UI (so users see why they're getting MXN). */
  country: string | null;
};

/**
 * Resolve the active currency for the current request.
 *
 * `searchParams` is passed in (rather than read from `nextUrl`) so this
 * function works inside both page server components (where `searchParams`
 * arrives as a prop) and other contexts. Pass `null` if you don't have
 * URL params at hand.
 */
export async function resolveCurrency(
  searchParams: Record<string, string | string[] | undefined> | null,
): Promise<CurrencyResolution> {
  // 1. URL param
  const urlRaw = searchParams?.["currency"];
  const urlString = Array.isArray(urlRaw) ? urlRaw[0] : urlRaw;
  const urlCurrency = normalizeDefaultCurrency(urlString);
  if (urlCurrency) {
    return { currency: urlCurrency, source: "url-param", country: null };
  }

  // 2. Cookie
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(CURRENCY_COOKIE)?.value;
  const cookieCurrency = normalizeDefaultCurrency(cookieValue);
  if (cookieCurrency) {
    return { currency: cookieCurrency, source: "cookie", country: null };
  }

  // 3. IP-country header (Vercel-provided in production; missing locally)
  const headerStore = await headers();
  const countryRaw = headerStore.get("x-vercel-ip-country");
  const country = countryRaw ? countryRaw.toLowerCase() : null;
  const ipCurrency = currencyForCountry(country);
  if (ipCurrency) {
    return { currency: ipCurrency, source: "ip-country", country };
  }

  // 4. Fallback
  return { currency: MARKETING_FALLBACK, source: "fallback", country };
}
