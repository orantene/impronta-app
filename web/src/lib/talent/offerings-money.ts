/**
 * Regional money formatting for catalogue prices (2026-09-22).
 *
 * `formatOfferingPrice` (offerings-types.ts) collapses the UI locale to the
 * bare language ("es" | "en") before handing it to Intl. That is right for the
 * number grouping, but it loses the REGION, and the region is what decides how
 * a currency symbol is drawn:
 *
 *   Intl.NumberFormat("es",    { currency: "MXN" }).format(300) → "300 MXN"
 *   Intl.NumberFormat("es-MX", { currency: "MXN" }).format(300) → "$300"
 *
 * A Mexican beauty studio's menu should read "$300", not "300 MXN" on every
 * row. This module resolves the currency's HOME locale so a catalogue priced in
 * the local currency prints the way its clients write it, and falls back to the
 * bare language for anything unmapped (no behaviour change for those).
 *
 * Pure module — no React, no server code. Safe on both sides of the boundary,
 * and deterministic between SSR and hydration because the locale is derived
 * from data, never from the browser.
 */

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
 * Price string for a catalogue amount, region-aware. Whole amounts print with
 * no decimals ("$300"); anything with cents keeps two ("$300.50").
 */
export function formatMoney(amountCents: number, currency: string, locale: string): string {
  const amount = amountCents / 100;
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(moneyLocale(cur, locale), {
      style: "currency",
      currency: cur,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toLocaleString()}`;
  }
}
