/**
 * price-catalog.ts — checkout resolves Stripe Price IDs from the DB catalog.
 *
 * WHY THIS EXISTS: checkout used to read ten `STRIPE_PRICE_*` environment
 * variables while every marketing surface read `product_prices`. Two sources
 * for one fact, and they drifted: after the 2026 repricing the catalog held the
 * new account's prices while the env vars still pointed at the old account, so
 * the site advertised $9 and checkout would have billed the old price. Env vars
 * also mean a Vercel visit (and a redeploy) for every price change.
 *
 * Now `product_prices` is the single source of truth for WHAT to charge, and
 * env keeps only what genuinely cannot live in a database the app reads: the
 * Stripe API credentials themselves.
 *
 * A price is eligible only when its TIER is active, the price row is active and
 * unarchived, and it is not inside a time-boxed sale window — checkout must
 * charge the canonical price, never a marketing sale row. USD only, per the
 * platform's standing currency rule.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type {
  BillingInterval,
  TalentPlanKey,
  WorkspacePlanKey,
} from "./price-ids";

/**
 * Plan key → `product_tiers.slug`. The slugs are historical and deliberately
 * NOT renamed: `max` is the tier displayed as "Portfolio". Renaming the slug
 * would break every existing subscription row that references it.
 */
export const WORKSPACE_TIER_SLUG: Record<WorkspacePlanKey, string | null> = {
  website: "website",
  studio: "studio",
  agency: "agency",
  // Network is sales-assisted: no catalog price, so no self-serve checkout.
  network: null,
};

export const TALENT_TIER_SLUG: Record<TalentPlanKey, string> = {
  talent_pro: "pro",
  talent_portfolio: "max",
};

/** Our billing vocabulary → the catalog's `product_prices.interval` values. */
export const INTERVAL_COLUMN: Record<BillingInterval, string> = {
  monthly: "month",
  annual: "year",
};

async function resolvePriceIdForTier(
  tierSlug: string,
  interval: BillingInterval,
): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    // No service-role client means no catalog read; refuse rather than guess a
    // price. Checkout surfaces this as "no price configured".
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("product_prices")
      .select("stripe_price_id, valid_from, valid_until, product_tiers!inner(slug, is_active)")
      .eq("product_tiers.slug", tierSlug)
      .eq("product_tiers.is_active", true)
      .eq("currency", "USD")
      .eq("interval", INTERVAL_COLUMN[interval])
      .eq("is_active", true)
      .is("archived_at", null);

    if (error) {
      logServerError("stripe.price-catalog.resolve", error);
      return null;
    }

    // The canonical row is the one with no validity window. Sale rows are
    // time-boxed and belong to marketing, not to what we charge.
    const canonical = (data ?? []).find(
      (row) => row.valid_from === null && row.valid_until === null,
    );
    return canonical?.stripe_price_id?.trim() || null;
  } catch (err) {
    logServerError("stripe.price-catalog.resolve", err);
    return null;
  }
}

/**
 * The Stripe Price ID for a workspace plan, or null when the catalog has no
 * eligible price — which is the correct answer for `network` (sales-assisted)
 * and for any tier whose `is_active` is false (e.g. Website before launch).
 */
export async function resolveWorkspacePriceId(
  plan: WorkspacePlanKey,
  interval: BillingInterval = "monthly",
): Promise<string | null> {
  const slug = WORKSPACE_TIER_SLUG[plan];
  if (!slug) return null;
  return resolvePriceIdForTier(slug, interval);
}

/** The Stripe Price ID for a talent plan, or null when none is eligible. */
export async function resolveTalentPriceId(
  plan: TalentPlanKey,
  interval: BillingInterval = "monthly",
): Promise<string | null> {
  return resolvePriceIdForTier(TALENT_TIER_SLUG[plan], interval);
}
