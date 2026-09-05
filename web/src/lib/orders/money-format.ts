/**
 * ONE way to render an order's money. There must not be a second.
 *
 * There were two. `order-card.ts` had a deliberate hand-rolled formatter with a
 * documented reason, and the Orders desk — which I wrote hours later — used
 * `Intl.NumberFormat` with `style: "currency"`. The same 4500-peso order
 * rendered two ways on two screens:
 *
 *   card   4,500.00 ARS
 *   desk   ARS 4,500.00      and for MXN, MX$4,500.00
 *
 * The card's reasoning was right and I had ignored it by not looking: `Intl`
 * renders "MX$", "US$" and bare codes inconsistently across runtimes and
 * locales, and this string sits next to a figure a customer is about to be
 * charged. Explicit and boring beats clever.
 *
 * Whose format wins is less important than that ONE does. This is the card's,
 * because it was the considered one.
 */

/** Currencies whose minor unit is not 1/100. Extend deliberately, never guess. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "VND", "ISK", "COP", "PYG", "XAF", "XOF"]);

export function minorUnitDivisor(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

/**
 * Minor units to a displayable string.
 *
 * USD keeps its bare `$` because that is what this platform bills in and what
 * every existing screen and test shows. EVERY other currency carries its code,
 * so a peso is never mistaken for a dollar — which on ARS is an error of about
 * a thousand times, and silent: no null, no throw, just a plausible number.
 */
export function formatOrderMoney(cents: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  const divisor = minorUnitDivisor(code);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / divisor);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (divisor === 1) {
    // A zero-decimal currency has no cents to show. Printing ".00" invents a
    // precision the currency does not have.
    return `${sign}${grouped} ${code}`;
  }
  const frac = String(abs % divisor).padStart(2, "0");
  const isUsd = code === "USD";
  return `${sign}${isUsd ? "$" : ""}${grouped}.${frac}${isUsd ? "" : ` ${code}`}`;
}
