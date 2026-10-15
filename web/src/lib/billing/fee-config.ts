/**
 * fee-config.ts — THE one place fee rates live (TUL-1061).
 *
 * Every number a user can see (checkout lines, the settings preview, receipts,
 * the talent payout view, legal copy) and every number the server charge uses
 * comes from here. `fee-config.static.test.ts` fails when a new hardcoded
 * Tulala client-fee or Stripe card-rate literal appears anywhere else in src/.
 *
 * ONLY VERIFIED FIGURES (Notion wiki "Payments at Tulala: How We Use Stripe",
 * sections 5 and 5A, checked 2026-10-14):
 *   - US cards 2.9% + 30 cents
 *   - MX cards 3.6% + MXN 3, plus 16% IVA on the fee
 *   - Tulala client service fee +1.5%
 *   - Connect payout and per-account fees are paid by Tulala: NOT a client or
 *     talent fee, so they are intentionally absent here.
 * Deliberately NOT here (unverified, never show to users): an international
 * card surcharge, a currency-conversion surcharge, combined "all-in" card
 * figures for foreign cards, and any stablecoin payout fee.
 */

import type { ProcessorFeeRates } from "./commission";

/** Tulala's client service fee in basis points (150 = 1.5%). */
export const CLIENT_SERVICE_FEE_BPS = 150;

/**
 * Canonical processor fee table, shared by the charge path and every preview.
 * Mirrors the SQL default on platform_commission_config.processor_fee_rates.
 */
export const DEFAULT_PROCESSOR_FEE_RATES: Readonly<Record<string, ProcessorFeeRates>> = {
  default: { percent: 0.029, fixed_cents: 30, tax_on_fee: 0 },
  mxn: { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 },
};

export function processorFeeRatesForCurrency(currency: string): ProcessorFeeRates {
  const key = (currency ?? "").trim().toLowerCase();
  return DEFAULT_PROCESSOR_FEE_RATES[key] ?? DEFAULT_PROCESSOR_FEE_RATES.default;
}

/** Display percent for a bps value: 150 -> "1.5%". */
export function formatBpsPercent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** The configured client service fee as display text ("1.5%"). */
export function clientServiceFeePercentLabel(): string {
  return formatBpsPercent(CLIENT_SERVICE_FEE_BPS);
}

/** Card rate in basis points (0.029 -> 290), for code that works in bps. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 10_000);
}

/**
 * Checkout card-fee display (TUL-654, Oran's decision pending). ONE flag.
 *   false (default, today): the checkout shows exactly the lines the engine
 *     snapshot produced (a "Card processing" line only when the seller chose
 *     "my client pays it").
 *   true: when the seller absorbs the card fee, checkout also shows a
 *     non-additive memo line "Card fee included in the price: about X",
 *     computed from the verified rates above. The total is unchanged.
 * Switch with the env var TULALA_CHECKOUT_CARD_FEE_LINE=1 (server-read only).
 */
export function checkoutCardFeeLineEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TULALA_CHECKOUT_CARD_FEE_LINE === "1";
}

/**
 * Documented payout timing, the only figures the talent view may state
 * (docs.stripe.com/payouts country table).
 *   - businessDays, by payout country: funds available after N business days
 *     (US 2, MX 3, CA 3)
 *   - firstPayoutDays: Stripe's documented "typically 7-14 days" for a new
 *     account's first payout (MX and CA also state 7 calendar days)
 *   - recipient: not offered yet (no live recipient countries). Kept so it can
 *     come back when recipient countries go live; the live view never shows it.
 */
export const PAYOUT_ARRIVAL = {
  businessDays: { us: 2, mx: 3, ca: 3 },
  firstPayoutDays: { min: 7, max: 14 },
  recipient: { extraHours: 24 },
} as const;

export type PayoutArrivalCountry = keyof typeof PAYOUT_ARRIVAL.businessDays;

/** Business days for a payout country (ISO-2), or null when not documented. */
export function payoutBusinessDaysForCountry(iso2: string | null | undefined): number | null {
  const k = (iso2 ?? "").trim().toLowerCase();
  return k in PAYOUT_ARRIVAL.businessDays ? PAYOUT_ARRIVAL.businessDays[k as PayoutArrivalCountry] : null;
}

export type PayoutPlatform = "mx" | "us";

/** MXN charges settle on the MX platform, everything else on the US platform. */
export function payoutPlatformForCurrency(currency: string): PayoutPlatform {
  return (currency ?? "").trim().toUpperCase() === "MXN" ? "mx" : "us";
}

/**
 * The verified fee table, as rows for any UI that lists fees. Connect payout
 * and account fees are excluded on purpose (Tulala pays them).
 */
export const VERIFIED_FEE_TABLE = [
  { id: "tulala_client", scope: "client", bps: CLIENT_SERVICE_FEE_BPS },
  { id: "card_us", scope: "card", currency: "USD", rates: DEFAULT_PROCESSOR_FEE_RATES.default },
  { id: "card_mx", scope: "card", currency: "MXN", rates: DEFAULT_PROCESSOR_FEE_RATES.mxn },
] as const;
