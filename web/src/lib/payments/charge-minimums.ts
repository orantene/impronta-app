/**
 * charge-minimums.ts — refuse a charge WE know Stripe will refuse.
 *
 * Stripe enforces a minimum charge amount per currency "to ensure the Stripe
 * fee does not exceed your charge". Nothing in this codebase checked it, so the
 * first peso price set below the floor would have been refused at the Stripe
 * call — after the buyer committed, with a provider error rather than a
 * sentence anyone can act on.
 *
 * WHY THIS IS NOT A ROUNDING DETAIL. The floors are not proportional:
 *
 *     USD  0.50          MXN  10.00        ← twenty times, not a bit more
 *     GBP  0.30          HUF 175.00
 *     EUR  0.50          CZK  15.00
 *
 * A tenant pricing a 5-peso item is nowhere near the USD intuition of "half a
 * dollar". Any check that reasons in dollars and converts is wrong for exactly
 * the tenants we are adding.
 *
 * THE SETTLEMENT CAVEAT, stated because it changes the answer. Stripe's docs
 * are explicit that the applicable minimum follows the SETTLEMENT currency of
 * the bank account, not the presentment currency: a charge that must be
 * converted to your default settlement currency has to clear the minimum in
 * THAT currency after conversion. We settle in USD today and hold no MXN bank
 * account, so an MXN charge converts to USD and must clear USD 0.50.
 *
 * This module deliberately checks the PRESENTMENT currency's own floor anyway.
 * The two are aligned by construction — Stripe set MXN 10 at roughly USD 0.50 —
 * so checking the presentment floor refuses the same charges without needing a
 * live FX rate, which we do not have in any money path and should not add.
 * If we ever open an MXN settlement account, this comment is the thing to
 * re-read: the floor becomes authoritative rather than a proxy.
 *
 * Source: https://docs.stripe.com/currencies — "Minimum and maximum charge
 * amounts", read 2026-09-06. Figures are transcribed, never inferred; a
 * currency Stripe does not list is UNKNOWN here, never assumed to be 0.50.
 */

/** Minimum charge per currency, in the currency's MINOR unit. */
const MINIMUM_MINOR: Readonly<Record<string, number>> = {
  // Two-decimal currencies: minor units = major * 100.
  USD: 50, AED: 200, ARS: 50, AUD: 50, BRL: 50, CAD: 50, CHF: 50, COP: 50,
  CZK: 1500, DKK: 250, EUR: 50, GBP: 30, HKD: 400, HUF: 17500, IDR: 50,
  ILS: 50, INR: 50, MXN: 1000, MYR: 200, NOK: 300, NZD: 50, PHP: 50,
  PLN: 200, RON: 200, RUB: 50, SEK: 300, SGD: 50, THB: 1000, ZAR: 50,
  // Zero-decimal: the amount IS the minor unit, so no multiplication.
  JPY: 50, KRW: 50,
};

export type ChargeMinimumVerdict =
  | { ok: true }
  | { ok: false; reason: "below_minimum"; minimumMinor: number; currency: string }
  | { ok: false; reason: "unknown_currency"; currency: string }
  | { ok: false; reason: "not_positive" };

/**
 * May we send this amount to Stripe?
 *
 * Refuses an UNRECOGNISED currency rather than waving it through. The failure
 * directions are not symmetric: a wrongly refused charge is a visible error a
 * tenant reports, while a wrongly accepted one reaches Stripe, fails there, and
 * surfaces to a buyer who has already decided to pay. Absence of a known floor
 * is not evidence that the amount clears it.
 */
export function checkChargeMinimum(amountMinor: number, currency: string): ChargeMinimumVerdict {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return { ok: false, reason: "not_positive" };
  const code = (currency ?? "").trim().toUpperCase();
  const min = MINIMUM_MINOR[code];
  if (min === undefined) return { ok: false, reason: "unknown_currency", currency: code };
  if (amountMinor < min) return { ok: false, reason: "below_minimum", minimumMinor: min, currency: code };
  return { ok: true };
}

/** The documented floor, or null when Stripe does not list the currency. */
export function chargeMinimumMinor(currency: string): number | null {
  return MINIMUM_MINOR[(currency ?? "").trim().toUpperCase()] ?? null;
}

export const SUPPORTED_MINIMUM_CURRENCIES = Object.keys(MINIMUM_MINOR).sort();
