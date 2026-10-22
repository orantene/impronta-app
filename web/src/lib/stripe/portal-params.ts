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

/**
 * Per-audience configuration ids (QA 2026-10-21, P2): a talent's portal must
 * offer only talent products and a workspace's only workspace products, which
 * is a property of a portal CONFIGURATION (subscription_update.products). The
 * audience id wins; the account-wide id above is the fallback, so nothing
 * changes until an operator sets the new names. Under STRIPE_FORCE_TEST_MODE
 * each resolves from its `_TEST` sibling (STRIPE_TALENT_PORTAL_CONFIGURATION_ID_TEST).
 */
export type PortalAudience = "talent" | "workspace";

export const PORTAL_AUDIENCE_CONFIGURATION_ENV: Record<PortalAudience, Record<PortalAccount, string>> = {
  talent: {
    us: "STRIPE_TALENT_PORTAL_CONFIGURATION_ID",
    mx: "STRIPE_MX_TALENT_PORTAL_CONFIGURATION_ID",
  },
  workspace: {
    us: "STRIPE_WORKSPACE_PORTAL_CONFIGURATION_ID",
    mx: "STRIPE_MX_WORKSPACE_PORTAL_CONFIGURATION_ID",
  },
};

function readConfigurationId(name: string, env: Record<string, string | undefined>): string | undefined {
  const v = stripeEnv(name, env)?.trim();
  // A configuration id always starts with `bpc_`. Anything else (a live id
  // pasted into a test env, a placeholder) would make Stripe reject the
  // session, so it is treated as unset and the next fallback is used.
  return v && v.startsWith("bpc_") ? v : undefined;
}

export function portalConfigurationId(
  account: PortalAccount = "us",
  env: Record<string, string | undefined> = process.env,
  audience?: PortalAudience,
): string | undefined {
  const scoped = audience
    ? readConfigurationId(PORTAL_AUDIENCE_CONFIGURATION_ENV[audience][account], env)
    : undefined;
  return scoped ?? readConfigurationId(PORTAL_CONFIGURATION_ENV[account], env);
}

/** Same params without the configuration, for the one retry when Stripe rejects it. */
export function withoutPortalConfiguration<T extends { configuration?: string }>(
  params: T,
): Omit<T, "configuration"> {
  const { configuration: _drop, ...rest } = params;
  void _drop;
  return rest;
}

export function buildPortalSessionParams(opts: {
  customerId: string;
  returnUrl: string;
  locale?: string | null;
  account?: PortalAccount;
  /** Which products the portal may offer for plan switching (see above). */
  audience?: PortalAudience;
  env?: Record<string, string | undefined>;
}) {
  const configuration = portalConfigurationId(opts.account ?? "us", opts.env, opts.audience);
  return {
    customer: opts.customerId,
    return_url: opts.returnUrl,
    locale: stripeBillingPortalLocale(opts.locale),
    ...(configuration ? { configuration } : {}),
  };
}
