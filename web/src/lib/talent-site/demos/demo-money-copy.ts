/**
 * TUL-569: typed demo copy ("Revisión $550", "Desde $500", "-$50") must read
 * like the services table, which always carries the code ("$550 MXN"). A bare
 * "$550" next to "$550 MXN" on the same page reads as two prices.
 *
 * Applied when a content fixture is loaded, so every demo rebuild writes the
 * coded form. Amounts already followed by a code, and "US$" / "MX$", are left.
 */

const BARE_AMOUNT = /(^|[^\w$])([+-]?)\$(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?!\d|[.,]\d|\s*(?:MXN|USD)\b)/g;

export function addCurrencyCode(text: string, currency: string): string {
  return text.replace(BARE_AMOUNT, (_m, pre: string, sign: string, n: string) => `${pre}${sign}$${n} ${currency}`);
}

/** Every string inside `value`, coded. Returns new arrays/objects; never mutates. */
export function withCurrencyCodes<T>(value: T, currency: string): T {
  if (typeof value === "string") return addCurrencyCode(value, currency) as T;
  if (Array.isArray(value)) return value.map((v) => withCurrencyCodes(v, currency)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = withCurrencyCodes(v, currency);
    return out as T;
  }
  return value;
}
