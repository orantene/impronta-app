/**
 * stripe-account-info.ts — read-only ping of `/v1/account` for the
 * StripeAccountCard on the Product Pricing dashboard.
 *
 * Surfaces which Stripe account the dashboard is currently wired to —
 * essential because the dashboard's Stripe-sync writes (Phase 1+) will
 * land in whatever account `STRIPE_SECRET_KEY` points at.
 *
 * Cached per-request via React `cache()` so the page header + the
 * StripeAccountCard can both read it without two API round-trips.
 */

import "server-only";
import { cache } from "react";
import { logServerError } from "@/lib/server/safe-error";
import type { StripeAccountInfo } from "./pricing-types";

// Direct fetch (not the Stripe SDK) — `stripe.accounts.retrieve()` with no
// args requires a Connect-style account ID in the 18.x TS types, but the
// underlying REST endpoint `GET /v1/account` happily returns the account
// associated with the secret key. Plain fetch is the simplest workaround.
type StripeAccountResponse = {
  id: string;
  email: string | null;
  country: string | null;
  charges_enabled: boolean;
  settings?: { dashboard?: { display_name?: string | null } };
  business_profile?: { name?: string | null };
};

/**
 * Hits Stripe `/v1/account` and returns a flat shape ready for the UI.
 *
 * Notes:
 * - `displayName` comes from `settings.dashboard.display_name` — this
 *   is what the user actually sees in the Stripe dashboard top-left.
 * - `testMode` is derived from the secret-key prefix (`sk_test_`),
 *   since `/v1/account` doesn't include a livemode flag on this object.
 */
export const loadStripeAccountInfo = cache(
  async (): Promise<StripeAccountInfo> => {
    const now = new Date().toISOString();
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return { ok: false, error: "STRIPE_SECRET_KEY not set.", reason: "no-key", fetchedAt: now };
    }
    try {
      const res = await fetch("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${key}` },
        // No cache — we want fresh data when the user clicks Re-verify.
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const isAuth = res.status === 401;
        return {
          ok: false,
          error: `Stripe HTTP ${res.status}`,
          reason: isAuth ? "bad-key" : "api-error",
          fetchedAt: now,
        };
      }
      const account = (await res.json()) as StripeAccountResponse;
      return {
        ok: true,
        accountId: account.id,
        displayName: account.settings?.dashboard?.display_name ?? null,
        businessName: account.business_profile?.name ?? null,
        email: account.email ?? null,
        country: account.country ?? null,
        chargesEnabled: account.charges_enabled ?? false,
        testMode: key.startsWith("sk_test_"),
        fetchedAt: now,
      };
    } catch (err) {
      logServerError("stripe-account-info.retrieve", err);
      const message = err instanceof Error ? err.message : "Stripe API error";
      const isAuthError = /invalid api key|expired|authentication/i.test(message);
      return {
        ok: false,
        error: message,
        reason: isAuthError ? "bad-key" : "api-error",
        fetchedAt: now,
      };
    }
  },
);
