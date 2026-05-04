/**
 * lib/stripe/client.ts
 *
 * Server-only Stripe SDK instance.
 *
 * Import this module only in server-side code (Server Components, server
 * actions, API route handlers). Never import in client components.
 *
 * The `stripe` export is null when STRIPE_SECRET_KEY is not set — all
 * callers must check `isStripeConfigured()` or handle null.
 */

import "server-only";
import Stripe from "stripe";

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

let _stripe: Stripe | null = null;

/**
 * Returns the Stripe client, or null if STRIPE_SECRET_KEY is not set.
 * Instance is module-scoped (singleton per Vercel function invocation).
 */
export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Stripe 22.x API version — pin to the version shipped with this SDK.
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}
