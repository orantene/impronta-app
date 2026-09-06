/**
 * The tenant's DISPLAY currency — what its customers are quoted in.
 *
 * Lives at `agencies.settings.display_currency`, and the reason is the whole
 * ruling: NOTHING ELSE READS IT. A new key cannot leak into a money path.
 *
 * The two existing columns both can, which is why neither is used:
 *
 *   `preferred_currency`  read by `payments/stripe-connect.ts` and workspace
 *                         billing. Setting a restaurant's to ARS would render
 *                         their TULALA SUBSCRIPTION in pesos — the exact thing
 *                         the USD-only rule forbids, arriving as a plausible
 *                         wrong number rather than an error. I recommended this
 *                         column and was overruled; my reason for it, "already
 *                         wired and tenant-writable", is precisely what made it
 *                         unsafe.
 *
 *   `default_currency`    drives `agency-financials-by-currency` and two live
 *                         UIs. Same hazard, different path.
 *
 * BILLING STAYS USD. This value never reaches a subscription, a commission, a
 * payout or a plan summary. It decides what an ORDER is priced and shown in,
 * and nothing else.
 */

/** ISO 4217: three letters. Anything else is not a currency. */
const CODE = /^[A-Z]{3}$/;

export const BILLING_CURRENCY = "USD";

/**
 * Read the display currency from a tenant's settings blob.
 *
 * ABSENT MEANS USD, deliberately: a tenant that has never chosen is not a
 * tenant with a broken currency, and defaulting to the billing currency is the
 * behaviour every existing row already has.
 *
 * A malformed value also falls back rather than propagating. "ARS " or "pesos"
 * reaching `orders.currency` would breach its CHECK at insert time, turning a
 * settings typo into a failed checkout.
 */
export function displayCurrencyFromSettings(settings: unknown): string {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return BILLING_CURRENCY;
  const raw = (settings as Record<string, unknown>).display_currency;
  if (typeof raw !== "string") return BILLING_CURRENCY;
  const code = raw.trim().toUpperCase();
  return CODE.test(code) ? code : BILLING_CURRENCY;
}

/**
 * The currency an ORDER is denominated in.
 *
 * THE OFFERING IS THE TRUTH. `talent_offerings.currency` already exists, is NOT
 * NULL, and defaults to USD, so every row already carries an answer; an
 * importer sets it per row from the source. The tenant key is only the DEFAULT
 * applied when an offering is created, never a second source consulted at
 * purchase time — two sources for one fact is how they drift.
 *
 * A cart mixing currencies is REFUSED rather than picked between. Summing ARS
 * and USD under one symbol is the mixed-total bug #1779 fixed on the desk, and
 * an order is a worse place for it because someone is charged.
 */
export type OrderCurrencyResolution =
  | { ok: true; currency: string }
  | { ok: false; reason: "mixed_currency_cart"; currencies: string[] };

export function resolveOrderCurrency(
  lineCurrencies: readonly (string | null | undefined)[],
): OrderCurrencyResolution {
  const seen = new Set<string>();
  for (const c of lineCurrencies) {
    const code = (c ?? "").trim().toUpperCase();
    // An offering with no currency is not a mixed cart — it is a row that
    // predates the column's use, and it takes the billing default.
    seen.add(CODE.test(code) ? code : BILLING_CURRENCY);
  }
  if (seen.size === 0) return { ok: true, currency: BILLING_CURRENCY };
  if (seen.size > 1) return { ok: false, reason: "mixed_currency_cart", currencies: [...seen].sort() };
  return { ok: true, currency: [...seen][0]! };
}
