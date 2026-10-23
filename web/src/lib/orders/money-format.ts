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

/**
 * Currencies whose minor unit is not 1/100: Stripe's zero-decimal list, verbatim.
 * Extend deliberately, never guess.
 *
 * COP and ISK are NOT here. Stripe treats COP as two-decimal (the amount is in
 * centavos), so listing it zero-decimal sent a 50,000 peso price as 50,000
 * centavos = 500 pesos, a charge 100x too small. ISK is Stripe's special case:
 * two-decimal in the API (amount = whole krona x 100, always a multiple of 100),
 * so it takes divisor 100 like any other.
 */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "VND", "VUV", "XAF", "XOF", "XPF",
]);

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

/**
 * TUL-1922: the same formatter, locale-aware about the bare `$`.
 *
 * A bare `$` reads as dollars to an English reader, but on a Spanish page the
 * reader's default `$` is the peso, so "$25.00" on a receipt is ambiguous. For
 * a non-English locale USD therefore keeps its symbol AND carries its code
 * ("$25.00 USD"). Every other case is exactly `formatOrderMoney`.
 */
export function formatOrderMoneyForLocale(cents: number, currency: string, locale: string | null | undefined): string {
  const base = formatOrderMoney(cents, currency);
  const code = (currency || "USD").toUpperCase();
  const lang = (locale ?? "en").trim().toLowerCase().slice(0, 2) || "en";
  return code === "USD" && lang !== "en" ? `${base} USD` : base;
}
