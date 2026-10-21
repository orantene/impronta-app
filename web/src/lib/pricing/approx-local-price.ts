/**
 * approx-local-price.ts: ONE display helper for "about this much in your
 * currency" lines on USD-billed marketing prices (TUL-864 / TUL-892).
 *
 * Platform spine is USD: the catalog and the charge are USD. The Spanish
 * site adds an approximate MX$ line under the USD price so a Mexico visitor
 * is not left converting in their head. DISPLAY ONLY. It never changes the
 * amount charged, and it is omitted (not guessed) when no rate is available.
 */

import type { FxPreview } from "./pricing-types";

/** Locale -> the local currency we show an approximation in (USD-billed). */
export function approxCurrencyForLocale(locale: string | null | undefined): "MXN" | null {
  return locale?.trim().toLowerCase().startsWith("es") ? "MXN" : null;
}

/** Pull a usable rate out of an FxPreview; null when absent or not sane. */
export function fxRateFor(fx: FxPreview | null | undefined, code: string): number | null {
  if (!fx || !fx.ok) return null;
  const r = fx.rates[code];
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * "≈ MX$ 160" from a USD minor-unit amount (cents). Rounds to whole pesos.
 * Returns null for zero/negative/invalid input or a missing rate.
 */
export function formatApproxLocal(
  usdMinor: number | null | undefined,
  rate: number | null,
  currency: "MXN",
): string | null {
  if (rate == null || usdMinor == null || !Number.isFinite(usdMinor) || usdMinor <= 0) {
    return null;
  }
  const whole = Math.round((usdMinor / 100) * rate);
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = currency === "MXN" ? "MX$" : currency;
  return `≈ ${symbol} ${grouped}`;
}

/**
 * "MX$ 160": the converted PRIMARY price when a visitor views the USD catalog
 * in pesos (TUL-864). Same rounding as the approx line, no leading "≈".
 * Null when the rate or amount is unusable (caller keeps the USD price).
 */
export function formatConvertedLocal(
  usdMinor: number | null | undefined,
  rate: number | null,
  currency: "MXN",
): string | null {
  const approx = formatApproxLocal(usdMinor, rate, currency);
  return approx ? approx.replace(/^≈ /, "") : null;
}
