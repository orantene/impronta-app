/**
 * offer-currency.ts — pure rules for which currency an offer is priced in.
 *
 * Why: a talent who prices in MXN (stripe_account_platform 'mx') was offered
 * to the client as USD because createOffer defaulted to the platform currency
 * and the service preload copied the amount without its currency (TUL-274).
 * No I/O here; the seller lookup lives in `offer-currency-seller.ts`.
 */

const CODE_RE = /^[A-Za-z]{3}$/;

/** Upper-cased ISO-4217-shaped code, or null when the value is not one. */
export function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return CODE_RE.test(v) ? v.toUpperCase() : null;
}

/**
 * The currency a NEW offer starts in. If every known seller shares one
 * default_currency, the offer follows it. Mixed sellers, or no usable seller
 * currency, keep the platform operating currency (the behaviour before TUL-274).
 */
export function resolveOfferCurrency(input: {
  sellerCurrencies: ReadonlyArray<string | null | undefined>;
  platformCurrency: string;
}): string {
  const platform = normalizeCurrencyCode(input.platformCurrency) ?? "USD";
  const known = input.sellerCurrencies
    .map((c) => normalizeCurrencyCode(c))
    .filter((c): c is string => c !== null);
  if (known.length === 0) return platform;
  const first = known[0];
  return known.every((c) => c === first) ? first : platform;
}

export type OfferSellerCurrencyCheck =
  | { ok: true }
  | { ok: false; code: "offer_currency_seller_mismatch"; offerCurrency: string; sellerCurrency: string; message: string };

/**
 * The lane rule: with exactly ONE seller on the inquiry whose default_currency
 * is known, the offer must be priced in that currency (the seller's connected
 * account, and its Stripe platform, settle in it). Mixed sellers, no seller, or
 * an unknown seller currency are not refused: those offers stay on the platform
 * currency as before.
 */
export function checkOfferMatchesSeller(input: {
  offerCurrency: string | null | undefined;
  sellerCurrencies: ReadonlyArray<string | null | undefined>;
}): OfferSellerCurrencyCheck {
  const offer = normalizeCurrencyCode(input.offerCurrency);
  if (!offer || input.sellerCurrencies.length !== 1) return { ok: true };
  const seller = normalizeCurrencyCode(input.sellerCurrencies[0]);
  if (!seller || seller === offer) return { ok: true };
  return {
    ok: false,
    code: "offer_currency_seller_mismatch",
    offerCurrency: offer,
    sellerCurrency: seller,
    message: `This offer is in ${offer} but the seller charges in ${seller}; change the offer currency.`,
  };
}

export type PreloadCurrencyDecision =
  | { action: "apply" }
  | { action: "switch"; currency: string }
  | { action: "block"; serviceCurrency: string; offerCurrency: string };

/**
 * Picking a priced service fills a line's rate. The amount may only cross into
 * the offer when the currencies agree. If they differ and the draft has no
 * other priced line, the draft takes the service's currency; otherwise the
 * preload is refused (never copy an amount across currencies silently).
 */
export function decideServicePreload(input: {
  offerCurrency: string;
  serviceCurrency: string | null | undefined;
  serviceAmountCents: number | null | undefined;
  hasOtherPricedLines: boolean;
}): PreloadCurrencyDecision {
  // Templates and unpriced services carry no amount, so nothing can leak.
  if (input.serviceAmountCents == null) return { action: "apply" };
  const offer = normalizeCurrencyCode(input.offerCurrency) ?? "USD";
  const service = normalizeCurrencyCode(input.serviceCurrency);
  if (!service || service === offer) return { action: "apply" };
  if (!input.hasOtherPricedLines) return { action: "switch", currency: service };
  return { action: "block", serviceCurrency: service, offerCurrency: offer };
}

/**
 * "$850 MXN": narrow symbol plus the ISO code, because a bare "$" is ambiguous
 * between USD and MXN. Falls back to "850 MXN" if Intl rejects the code.
 */
export function formatOfferMoney(
  amount: number,
  currency: string | null | undefined,
  options: { maximumFractionDigits?: number; locale?: string } = {},
): string {
  const code = normalizeCurrencyCode(currency) ?? "USD";
  try {
    const n = new Intl.NumberFormat(options.locale ?? "en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: options.maximumFractionDigits,
    }).format(amount);
    return `${n} ${code}`;
  } catch {
    return `${amount} ${code}`;
  }
}
