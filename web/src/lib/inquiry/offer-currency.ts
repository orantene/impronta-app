/**
 * offer-currency.ts — pure rules for which currency an offer is priced in.
 *
 * Why: a talent who prices in MXN (stripe_account_platform 'mx') was offered
 * to the client as USD because createOffer defaulted to the platform currency
 * and the service preload copied the amount without its currency (TUL-274).
 * No I/O here; the seller lookup lives in `offer-currency-seller.ts`.
 */

import { formatDashboardMoney } from "@/lib/money/dashboard-money-format";

const CODE_RE = /^[A-Za-z]{3}$/;

/** The platform operating currency: what a record with no usable currency falls back to. */
export const PLATFORM_FALLBACK_CURRENCY = "USD";

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
  const platform = normalizeCurrencyCode(input.platformCurrency) ?? PLATFORM_FALLBACK_CURRENCY;
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
  const offer = normalizeCurrencyCode(input.offerCurrency) ?? PLATFORM_FALLBACK_CURRENCY;
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
  const code = normalizeCurrencyCode(currency) ?? PLATFORM_FALLBACK_CURRENCY;
  // The single dashboard format (DS-17) does the work; this keeps the offer
  // call sites' signature and puts the sign before the symbol ("-$5 MXN").
  const shown = formatDashboardMoney(Math.abs(amount), code, options.locale ?? "en", {
    wholeUnits: options.maximumFractionDigits === 0,
  });
  return amount < 0 && Math.round(Math.abs(amount) * 100) > 0 ? `-${shown}` : shown;
}

/**
 * Just the glyph for a currency ("$", "€", "R$"), for input prefixes and
 * compact badges. Never an amount. Unknown or malformed code: the platform
 * currency's glyph.
 */
export function moneySymbol(currency: string | null | undefined): string {
  const code = normalizeCurrencyCode(currency) ?? PLATFORM_FALLBACK_CURRENCY;
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/**
 * Read the currency off an already-formatted amount string such as
 * "$850 MXN" or "€1,200" (fixtures and legacy view-models hand strings, not
 * records). A trailing ISO code wins; "€" and "£" are unambiguous; a bare "$"
 * is ambiguous (USD, MXN, CAD...) so it yields null and the caller falls back.
 */
export function currencyFromMoneyText(text: string | null | undefined): string | null {
  if (!text) return null;
  const code = /\b([A-Za-z]{3})\s*$/.exec(text.trim());
  if (code) return code[1].toUpperCase();
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  return null;
}

/** The number inside an already-formatted amount string, or NaN. */
export function amountFromMoneyText(text: string | null | undefined): number {
  return parseFloat((text ?? "").replace(/[^0-9.]/g, ""));
}
