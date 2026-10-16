/**
 * lib/stripe/portal-params.ts (TUL-834)
 *
 * Pure builder for Stripe Billing Portal session params, shared by the
 * workspace and talent portal helpers. Kept free of `server-only` and the SDK
 * client so it is unit-testable.
 *
 * The portal `configuration` id comes from env, one per Stripe platform account
 * (US unprefixed, MX `STRIPE_MX_*`, matching the rest of the lane naming). It is
 * created by `scripts/seed-stripe-portal-config.mjs`. Unset means the account's
 * default portal configuration is used (parameter omitted, never empty).
 */
import { stripeEnv } from "./env-keys";
import { stripeBillingPortalLocale } from "@/lib/i18n/vendor-locale";

export type PortalAccount = "us" | "mx";

export const PORTAL_CONFIGURATION_ENV: Record<PortalAccount, string> = {
  us: "STRIPE_PORTAL_CONFIGURATION_ID",
  mx: "STRIPE_MX_PORTAL_CONFIGURATION_ID",
};

export function portalConfigurationId(
  account: PortalAccount = "us",
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const v = stripeEnv(PORTAL_CONFIGURATION_ENV[account], env)?.trim();
  return v ? v : undefined;
}

export function buildPortalSessionParams(opts: {
  customerId: string;
  returnUrl: string;
  locale?: string | null;
  account?: PortalAccount;
  env?: Record<string, string | undefined>;
}) {
  const configuration = portalConfigurationId(opts.account ?? "us", opts.env);
  return {
    customer: opts.customerId,
    return_url: opts.returnUrl,
    locale: stripeBillingPortalLocale(opts.locale),
    ...(configuration ? { configuration } : {}),
  };
}
