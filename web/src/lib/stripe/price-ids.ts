/**
 * lib/stripe/price-ids.ts
 *
 * Maps workspace plan keys to Stripe Price IDs.
 *
 * Price IDs live in environment variables so they can differ between
 * Vercel environments (test vs. live mode keys):
 *
 *   STRIPE_PRICE_STUDIO_MONTHLY    e.g. price_1PxxxxxxxxxxxxStudioMonthly
 *   STRIPE_PRICE_STUDIO_ANNUAL     e.g. price_1PxxxxxxxxxxxxStudioAnnual
 *   STRIPE_PRICE_AGENCY_MONTHLY    e.g. price_1PxxxxxxxxxxxxAgencyMonthly
 *   STRIPE_PRICE_AGENCY_ANNUAL     e.g. price_1PxxxxxxxxxxxxAgencyAnnual
 *
 * Network plan has no self-serve Price ID (requires sales contact).
 * Free plan has no Price ID (no Stripe subscription).
 *
 * Returns null when the env var is not set (billing not yet wired for
 * that plan/interval).
 */

import "server-only";

export type BillingInterval = "monthly" | "annual";

export type WorkspacePlanKey = "studio" | "agency";

const ENV_MAP: Record<WorkspacePlanKey, Record<BillingInterval, string>> = {
  studio: {
    monthly: "STRIPE_PRICE_STUDIO_MONTHLY",
    annual:  "STRIPE_PRICE_STUDIO_ANNUAL",
  },
  agency: {
    monthly: "STRIPE_PRICE_AGENCY_MONTHLY",
    annual:  "STRIPE_PRICE_AGENCY_ANNUAL",
  },
};

/**
 * Returns the Stripe Price ID for a given plan + interval, or null when
 * the environment variable is not set.
 */
export function getWorkspacePriceId(
  plan: WorkspacePlanKey,
  interval: BillingInterval = "monthly",
): string | null {
  const envKey = ENV_MAP[plan]?.[interval];
  if (!envKey) return null;
  return process.env[envKey]?.trim() || null;
}
