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

import { createServiceRoleClient } from "@/lib/supabase/admin";

export type BillingInterval = "monthly" | "annual";

// Network is sales-assisted today. Adding the key so a future commit can
// flip it to self-serve by setting STRIPE_PRICE_NETWORK_MONTHLY/ANNUAL.
export type WorkspacePlanKey = "studio" | "agency" | "network";

const ENV_MAP: Record<WorkspacePlanKey, Record<BillingInterval, string>> = {
  studio: {
    monthly: "STRIPE_PRICE_STUDIO_MONTHLY",
    annual:  "STRIPE_PRICE_STUDIO_ANNUAL",
  },
  agency: {
    monthly: "STRIPE_PRICE_AGENCY_MONTHLY",
    annual:  "STRIPE_PRICE_AGENCY_ANNUAL",
  },
  network: {
    monthly: "STRIPE_PRICE_NETWORK_MONTHLY",
    annual:  "STRIPE_PRICE_NETWORK_ANNUAL",
  },
};

/**
 * Returns the Stripe Price ID for a given workspace plan + interval, or null
 * when the environment variable is not set.
 */
export function getWorkspacePriceId(
  plan: WorkspacePlanKey,
  interval: BillingInterval = "monthly",
): string | null {
  const envKey = ENV_MAP[plan]?.[interval];
  if (!envKey) return null;
  return process.env[envKey]?.trim() || null;
}

const WORKSPACE_TIER_SLUG: Record<WorkspacePlanKey, string> = {
  studio: "studio",
  agency: "agency",
  network: "hub",
};

const PRICE_INTERVAL: Record<BillingInterval, "month" | "year"> = {
  monthly: "month",
  annual: "year",
};

type WorkspacePriceCandidate = {
  stripe_price_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
};

export function pickCurrentWorkspacePriceId(
  rows: WorkspacePriceCandidate[],
  now: Date = new Date(),
): string | null {
  const nowMs = now.getTime();
  const inWindow = rows.find((row) => {
    if (row.valid_from === null && row.valid_until === null) return false;
    const start = row.valid_from ? new Date(row.valid_from).getTime() : -Infinity;
    const end = row.valid_until ? new Date(row.valid_until).getTime() : Infinity;
    return nowMs >= start && nowMs < end;
  });
  const canonical = rows.find(
    (row) => row.valid_from === null && row.valid_until === null,
  );
  return inWindow?.stripe_price_id ?? canonical?.stripe_price_id ?? null;
}

/**
 * Returns the active workspace Stripe Price from the Product Pricing catalog.
 *
 * Env vars remain a fallback for local bootstrap / emergency recovery, but the
 * dashboard-owned `product_prices` row is the checkout source of truth once it
 * exists. This keeps admin price edits, sale windows, marketing display, and
 * Stripe Checkout pointed at the same active Price ID.
 */
export async function getActiveWorkspacePriceId(
  plan: WorkspacePlanKey,
  interval: BillingInterval = "monthly",
): Promise<string | null> {
  const fallback = getWorkspacePriceId(plan, interval);
  const admin = createServiceRoleClient();
  if (!admin) return fallback;

  const { data: pkg, error: pkgError } = await admin
    .from("product_packages")
    .select("id")
    .eq("slug", "workspace")
    .maybeSingle();
  if (pkgError || !pkg) return fallback;

  const { data: tier, error: tierError } = await admin
    .from("product_tiers")
    .select("id")
    .eq("package_id", pkg.id)
    .eq("slug", WORKSPACE_TIER_SLUG[plan])
    .eq("is_active", true)
    .maybeSingle();
  if (tierError || !tier) return fallback;

  const { data: rows, error: priceError } = await admin
    .from("product_prices")
    .select("stripe_price_id, valid_from, valid_until")
    .eq("tier_id", tier.id)
    .eq("currency", "USD")
    .eq("interval", PRICE_INTERVAL[interval])
    .eq("is_active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (priceError || !rows) return fallback;

  return pickCurrentWorkspacePriceId(rows) ?? fallback;
}

// ─── Talent plan price IDs ────────────────────────────────────────────────────
//
// Env vars:
//   STRIPE_PRICE_TALENT_PRO_MONTHLY        e.g. price_1PxxxxxxxxxxxxTalentProMonthly
//   STRIPE_PRICE_TALENT_PRO_ANNUAL         e.g. price_1PxxxxxxxxxxxxTalentProAnnual
//   STRIPE_PRICE_TALENT_PORTFOLIO_MONTHLY  e.g. price_1PxxxxxxxxxxxxPortfolioMonthly
//   STRIPE_PRICE_TALENT_PORTFOLIO_ANNUAL   e.g. price_1PxxxxxxxxxxxxPortfolioAnnual

export type TalentPlanKey = "talent_pro" | "talent_portfolio";

const TALENT_ENV_MAP: Record<TalentPlanKey, Record<BillingInterval, string>> = {
  talent_pro: {
    monthly: "STRIPE_PRICE_TALENT_PRO_MONTHLY",
    annual:  "STRIPE_PRICE_TALENT_PRO_ANNUAL",
  },
  talent_portfolio: {
    monthly: "STRIPE_PRICE_TALENT_PORTFOLIO_MONTHLY",
    annual:  "STRIPE_PRICE_TALENT_PORTFOLIO_ANNUAL",
  },
};

/**
 * Returns the Stripe Price ID for a given talent plan + interval, or null
 * when the environment variable is not set.
 */
export function getTalentPriceId(
  plan: TalentPlanKey,
  interval: BillingInterval = "monthly",
): string | null {
  const envKey = TALENT_ENV_MAP[plan]?.[interval];
  if (!envKey) return null;
  return process.env[envKey]?.trim() || null;
}
