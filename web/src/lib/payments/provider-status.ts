/**
 * Payment provider readiness for the Settings › Payments & providers panel.
 *
 * ANSWERS ONE QUESTION ONLY: is enough configuration present for the POS to
 * try this method. Never "did the last charge work" (that is the exceptions
 * queue's job) and never a live call to the provider — this is a config
 * check, not a health check, so it is free to run on every settings load.
 *
 * NEVER RETURNS A SECRET. Every field a caller can read is a boolean or a
 * closed reason code. The key values themselves never leave `computeProviderStatuses`.
 *
 * MERCADO PAGO POINT IS HONESTLY "NOT INTEGRATED", NOT "NEEDS KEYS". The
 * adapter exists (`mercado-pago-collection.ts`) and takes an access token as
 * a constructor argument, but nothing in this codebase reads one from an env
 * var or a per-tenant settings key and hands it to that adapter — grep across
 * the repo confirms it. "Needs keys" would imply a place to put them; there
 * is none yet, so this reports the honest, different state instead of
 * inventing a configuration path that does not exist (money.md §3).
 */

export const PROVIDER_IDS = ["cash", "stripe_checkout", "stripe_terminal", "mercado_pago_point"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderReason =
  | "no_setup_needed"
  | "ready"
  | "missing_secret_key"
  | "missing_reader"
  | "not_integrated";

export type ProviderStatus = {
  readonly id: ProviderId;
  readonly configured: boolean;
  readonly reason: ProviderReason;
};

export type ProviderStatusEnv = {
  readonly stripeSecretKey?: string | null;
  readonly stripeTerminalReaderId?: string | null;
};

/** Pure — takes its env as an argument so it is testable with no process.env reach-around. */
export function computeProviderStatuses(env: ProviderStatusEnv): ProviderStatus[] {
  const hasStripeKey = !!env.stripeSecretKey?.trim();
  const hasReader = !!env.stripeTerminalReaderId?.trim();

  return [
    { id: "cash", configured: true, reason: "no_setup_needed" },
    {
      id: "stripe_checkout",
      configured: hasStripeKey,
      reason: hasStripeKey ? "ready" : "missing_secret_key",
    },
    {
      id: "stripe_terminal",
      configured: hasStripeKey && hasReader,
      reason: !hasStripeKey ? "missing_secret_key" : !hasReader ? "missing_reader" : "ready",
    },
    { id: "mercado_pago_point", configured: false, reason: "not_integrated" },
  ];
}

/** The real env, read once at the call site so `computeProviderStatuses` stays pure. */
export function readProviderStatusEnv(): ProviderStatusEnv {
  return {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? null,
    stripeTerminalReaderId: process.env.STRIPE_TERMINAL_READER_ID ?? null,
  };
}
