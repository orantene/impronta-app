/**
 * Public catalogue money formatting.
 *
 * TUL-383 / DS-17 alignment: one format everywhere — `<symbol><amount> <CODE>`
 * (e.g. "$700 MXN"). Bare "$700" and baked-in "MX$700" are NOT produced; the
 * same string appears on / and /en. Delegates to `formatDashboardMoneyCents`
 * so the public site and the dashboard share one formatter.
 *
 * `moneyLocale` remains for callers that still need the currency's home
 * Intl locale (grouping, narrow symbol extraction inside the dashboard helper).
 */

import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";

/** currency → the locale whose conventions its home market uses. */
const HOME_LOCALE_BY_CURRENCY: Record<string, { es?: string; en?: string }> = {
  MXN: { es: "es-MX", en: "en-US" },
  ARS: { es: "es-AR", en: "en-US" },
  COP: { es: "es-CO", en: "en-US" },
  CLP: { es: "es-CL", en: "en-US" },
  EUR: { es: "es-ES", en: "en-IE" },
  USD: { es: "es-US", en: "en-US" },
};

/**
 * The Intl locale to format `currency` with, given the page's UI locale.
 * Unmapped currency → the bare language, i.e. today's behaviour.
 */
export function moneyLocale(currency: string, locale: string): string {
  const lang = locale.toLowerCase().startsWith("es") ? "es" : "en";
  const entry = HOME_LOCALE_BY_CURRENCY[currency.toUpperCase()];
  return entry?.[lang] ?? lang;
}

/**
 * Price string for a catalogue amount. Always `$700 MXN` (symbol + amount +
 * code), identical for es and en UI locales (TUL-383).
 */
export function formatMoney(amountCents: number, currency: string, locale: string): string {
  return formatDashboardMoneyCents(amountCents, currency || "USD", locale);
}
