/**
 * lib/stripe/account-routing.ts
 *
 * Pure routing: which Stripe PLATFORM account (US or Mexico) a seller's
 * Connect account belongs to. Unit-testable (type-only import of the client).
 *
 *   MX seller + any rail except USDC  -> 'mx'
 *   everything else (incl. USDC)      -> 'us'  (stablecoin payouts are US-only)
 *   'mx' but the MX key is missing    -> production: refuse (null) + console.error;
 *                                        elsewhere: 'us' + a warning
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
  /** Defaults to NODE_ENV === "production"; injectable for tests. */
  isProduction?: boolean;
  error?: (msg: string) => void;
}): StripeAccountKey | null {
  const country = (input.payoutCountry ?? "").trim().toUpperCase();
  const rail = (input.payoutRail ?? "").trim().toLowerCase();
  if (country !== "MX" || USDC_RAILS.has(rail)) return "us";
  const mxOk = input.mxConfigured ?? !!process.env.STRIPE_MX_SECRET_KEY;
  if (!mxOk) {
    if (input.isProduction ?? process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console -- pure module; intentional operator error
      (input.error ?? ((m) => console.error(m)))(
        "[stripe-account-routing] MX seller but STRIPE_MX_SECRET_KEY is unset in production; refusing (never charge an MX seller on the US platform)",
      );
      return null;
    }
    // eslint-disable-next-line no-console -- pure module; intentional operator warning
    (input.warn ?? ((m) => console.warn(m)))(
      "[stripe-account-routing] MX seller but STRIPE_MX_SECRET_KEY is unset; falling back to the US platform",
    );
    return "us";
  }
  return "mx";
}

export function normalizeStripePlatform(v: unknown): StripeAccountKey {
  return v === "mx" ? "mx" : "us";
}

export type LegPlatformDecision =
  | { ok: true; key: StripeAccountKey }
  | { ok: false; reason: string };

/**
 * A payout leg may only be transferred on the platform that TOOK THE CHARGE
 * (the funds sit in that platform's balance) AND that owns the recipient's
 * connected account. Any mismatch is a HOLD, never a cross-platform transfer.
 * The Global Payouts rail lives on the US platform only.
 */
export function decideLegPlatform(input: {
  chargePlatform: StripeAccountKey;
  recipientPlatform: StripeAccountKey;
  rail?: "connect_transfer" | "global_payouts";
}): LegPlatformDecision {
  if (input.rail === "global_payouts" && input.chargePlatform !== "us") {
    return { ok: false, reason: `global_payouts rail is US-platform only; charge was taken on ${input.chargePlatform}` };
  }
  if (input.chargePlatform !== input.recipientPlatform) {
    return {
      ok: false,
      reason: `cross-platform transfer refused: charge on ${input.chargePlatform}, recipient account on ${input.recipientPlatform}`,
    };
  }
  return { ok: true, key: input.chargePlatform };
}
