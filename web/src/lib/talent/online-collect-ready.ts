/**
 * PAY-2 Option B — when guests may Confirm/Buy for online-required offerings.
 *
 * Platform Stripe Checkout charges the customer. Talent Connect Express is
 * payout/transfer only (`skipped_no_account` holds transfers until onboarded).
 * Guests are gated only when platform Checkout cannot run — never on Connect.
 */

/** True when platform Checkout can charge (STRIPE_SECRET_KEY present). */
export function isPlatformCheckoutReady(
  env: { readonly STRIPE_SECRET_KEY?: string | null } = process.env as {
    readonly STRIPE_SECRET_KEY?: string | null;
  },
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

/**
 * Resolve SSR `onlineCollectReady` for catalog who-step honesty.
 * Option B: platform Checkout signal only. Connect status is ignored.
 */
export function resolveOnlineCollectReady(input: {
  platformCheckoutReady: boolean;
}): boolean {
  return input.platformCheckoutReady === true;
}
