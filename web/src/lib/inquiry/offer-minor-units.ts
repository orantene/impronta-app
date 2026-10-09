/**
 * offer-minor-units.ts — major-unit offer amounts to minor units, honouring the
 * offer currency's minor-unit divisor.
 *
 * inquiry_offers.total_client_price is numeric(12,2) in MAJOR units of the
 * offer's currency_code; Stripe and *_cents columns are MINOR units. A hard
 * coded `* 100` overcharges a zero-decimal currency (JPY, KRW...) 100x.
 * The divisor table lives in orders/money-format.ts (`minorUnitDivisor`), the
 * single source of truth. USD and MXN keep divisor 100: output is unchanged.
 *
 * Contract: an unreadable currency is REFUSED, never defaulted. `majorToMinor`
 * throws OfferCurrencyUnreadableError; `tryMajorToMinor` returns null for
 * callers that must turn the refusal into an EngineResult instead of a throw.
 */
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { normalizeCurrencyCode } from "./offer-currency";

export class OfferCurrencyUnreadableError extends Error {
  readonly code = "offer_currency_unreadable";
  constructor() {
    super("offer_currency_unreadable");
    this.name = "OfferCurrencyUnreadableError";
  }
}

/** Minor units for `major` in `currency`, or null when the currency is unreadable. */
export function tryMajorToMinor(major: number, currency: string | null | undefined): number | null {
  const code = normalizeCurrencyCode(currency);
  if (!code) return null;
  return Math.round(major * minorUnitDivisor(code));
}

/** As `tryMajorToMinor`, but throws OfferCurrencyUnreadableError when unreadable. */
export function majorToMinor(major: number, currency: string | null | undefined): number {
  const minor = tryMajorToMinor(major, currency);
  if (minor === null) throw new OfferCurrencyUnreadableError();
  return minor;
}

/**
 * DISPLAY / card side only (never a charge path): the divisor for an offer's
 * currency, 100 when the currency is absent or unreadable (the legacy
 * behaviour for USD and MXN). Charge paths use `majorToMinor`, which refuses.
 */
export function displayMinorDivisor(currency: string | null | undefined): number {
  const code = normalizeCurrencyCode(currency);
  return code ? minorUnitDivisor(code) : 100;
}

/** Display-side `majorToMinor`: unreadable currency keeps divisor 100. */
export function majorToMinorForDisplay(major: number, currency: string | null | undefined): number {
  return Math.round(major * displayMinorDivisor(currency));
}
