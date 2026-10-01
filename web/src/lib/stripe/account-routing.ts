/**
 * lib/stripe/account-routing.ts
 *
 * Pure routing: which Stripe PLATFORM account (US or Mexico) a seller's
 * Connect account belongs to. Unit-testable (type-only import of the client).
 *
 *   MX seller + any rail except USDC  -> 'mx'
 *   everything else (incl. USDC)      -> 'us'  (stablecoin payouts are US-only)
 *   'mx' but the MX key is missing    -> 'us' + a warning (fail safe)
 */

import type { StripeAccountKey } from "./client";

export type { StripeAccountKey };

const USDC_RAILS = new Set(["usdc", "stablecoin", "crypto"]);

export function resolveStripeAccountForSeller(input: {
  payoutCountry: string | null | undefined;
  payoutRail?: string | null;
  /** Defaults to the real env check; injectable for tests. */
  mxConfigured?: boolean;
  warn?: (msg: string) => void;
}): StripeAccountKey {
  const country = (input.payoutCountry ?? "").trim().toUpperCase();
  const rail = (input.payoutRail ?? "").trim().toLowerCase();
  if (country !== "MX" || USDC_RAILS.has(rail)) return "us";
  const mxOk = input.mxConfigured ?? !!process.env.STRIPE_MX_SECRET_KEY;
  if (!mxOk) {
    (input.warn ?? ((m) => console.warn(m)))(
      "[stripe-account-routing] MX seller but STRIPE_MX_SECRET_KEY is unset; falling back to the US platform",
    );
    return "us";
  }
  return "mx";
}
