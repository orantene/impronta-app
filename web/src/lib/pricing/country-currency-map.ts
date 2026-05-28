/**
 * country-currency-map.ts — ISO-3166 alpha-2 country code → ISO-4217
 * currency code mapping for the marketing pricing IP-detection flow
 * (Phase 2 of the Product Pricing dashboard).
 *
 * Pure data. No `server-only` marker — both server (resolver) and
 * client (picker dropdown) read this list.
 *
 * Scope: covers every currency the platform's `DEFAULT_CURRENCY_OPTIONS`
 * supports (USD/EUR/GBP/MXN/ARS/BRL/COP/CLP/PEN/CAD/AUD) plus
 * neighbouring countries that share those currencies (e.g., EUR for
 * all of the Eurozone). Anything not in the map falls back to USD.
 */

import type { DefaultCurrencyCode } from "@/lib/billing/currencies";

/**
 * Country code → preferred currency. Lowercase keys for cheap
 * normalization at the lookup site (Vercel's `x-vercel-ip-country`
 * is uppercase per ISO, but we keep this map lowercase-keyed and
 * lowercase the input — defensive against any header munging).
 */
export const COUNTRY_TO_CURRENCY: Record<string, DefaultCurrencyCode> = {
  // North America
  us: "USD",
  pr: "USD",
  vi: "USD",
  ca: "CAD",
  mx: "MXN",

  // LATAM
  ar: "ARS",
  br: "BRL",
  co: "COP",
  cl: "CLP",
  pe: "PEN",

  // United Kingdom
  gb: "GBP",

  // Eurozone (members as of 2026). Anything else in Europe → USD fallback.
  at: "EUR",
  be: "EUR",
  hr: "EUR",
  cy: "EUR",
  ee: "EUR",
  fi: "EUR",
  fr: "EUR",
  de: "EUR",
  gr: "EUR",
  ie: "EUR",
  it: "EUR",
  lv: "EUR",
  lt: "EUR",
  lu: "EUR",
  mt: "EUR",
  nl: "EUR",
  pt: "EUR",
  sk: "EUR",
  si: "EUR",
  es: "EUR",
  ad: "EUR", // Andorra
  mc: "EUR", // Monaco
  sm: "EUR", // San Marino
  va: "EUR", // Vatican

  // Oceania
  au: "AUD",
};

/**
 * Look up a currency for a country code. Returns null if unknown so the
 * caller can fall back to whatever they prefer (typically USD).
 */
export function currencyForCountry(
  countryCode: string | null | undefined,
): DefaultCurrencyCode | null {
  if (!countryCode) return null;
  const lower = countryCode.trim().toLowerCase();
  return COUNTRY_TO_CURRENCY[lower] ?? null;
}
