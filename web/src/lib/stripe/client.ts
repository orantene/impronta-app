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

// ─── Second platform account: Stripe Mexico ──────────────────────────────────

/** Which Stripe PLATFORM account a flow runs on. */
export type StripeAccountKey = "us" | "mx";

export function isStripeMxConfigured(): boolean {
  return !!process.env.STRIPE_MX_SECRET_KEY;
}

let _stripeMx: Stripe | null = null;

/** Mexico platform client, or null when STRIPE_MX_SECRET_KEY is unset. */
export function getStripeMx(): Stripe | null {
  if (!process.env.STRIPE_MX_SECRET_KEY) return null;
  if (!_stripeMx) {
    _stripeMx = new Stripe(process.env.STRIPE_MX_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripeMx;
}

/** Client for a platform account; null when that account's key is unset. */
export function getStripeFor(key: StripeAccountKey): Stripe | null {
  return key === "mx" ? getStripeMx() : getStripe();
}

/**
 * Run a lookup on whichever platform owns the object when the caller only has
 * its id (a Checkout session id carries no platform). Tries US, then MX when
 * configured, moving on ONLY for Stripe's `resource_missing`; any other error
 * is the real answer and is rethrown. Returns null when no client is configured.
 */
export async function withObjectPlatformFallback<T>(
  fn: (stripe: Stripe) => Promise<T>,
): Promise<T | null> {
  const clients = [getStripe(), getStripeMx()].filter((c): c is Stripe => c !== null);
  if (clients.length === 0) return null;
  let lastErr: unknown;
  for (const c of clients) {
    try {
      return await fn(c);
    } catch (err) {
      lastErr = err;
      const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
      if (code !== "resource_missing") throw err;
    }
  }
  throw lastErr;
}

/**
 * MX publishable key. Prefers NEXT_PUBLIC_ (the only form a client bundle can
 * read; set locally), falls back to the Vercel server-side name.
 */
export function getStripeMxPublishableKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY ||
    process.env.STRIPE_MX_PUBLISHABLE_KEY ||
    null
  );
}

/**
 * Publishable key of a platform account. Client-side Stripe objects (Connect
 * embedded onboarding, Elements) must be initialised with the key of the
 * platform that minted their session; an MX account session opened with the US
 * key fails.
 */
export function getStripePublishableKeyFor(key: StripeAccountKey): string | null {
  return key === "mx" ? getStripeMxPublishableKey() : (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null);
}
