/**
 * currency-resolver.ts — server-side currency resolution for marketing
 * surfaces (Phase 2 of the Product Pricing dashboard).
 *
 * Priority order (highest wins):
 *   1. ?currency=XXX URL param (transient explicit override)
 *   2. tulala-currency cookie  (sticky explicit override set by picker)
 *   3. USD fallback
 *
 * IP-country is intentionally not a source. Guessing MXN from
 * `x-vercel-ip-country` labeled the footer "Showing prices in MXN" while
 * `get-active-prices` fell back to USD amounts. The chip lied. Marketing
 * is USD unless the visitor picks otherwise.
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
import { cookies } from "next/headers";
import type { DefaultCurrencyCode } from "@/lib/billing/currencies";
import { pickMarketingCurrency } from "./pick-marketing-currency";

/** Cookie name the picker sets. Read here and only here. */
export const CURRENCY_COOKIE = "tulala-currency";

export type CurrencyResolution = {
  currency: DefaultCurrencyCode;
  source: "url-param" | "cookie" | "ip-country" | "fallback";
  /** Kept for the picker chip. Always null now that we do not guess from IP. */
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
  const urlRaw = searchParams?.["currency"];
  const urlString = Array.isArray(urlRaw) ? urlRaw[0] : urlRaw;
  const cookieStore = await cookies();
  const picked = pickMarketingCurrency({
    urlCurrency: urlString,
    cookieCurrency: cookieStore.get(CURRENCY_COOKIE)?.value,
  });
  return { ...picked, country: null };
}
