import "server-only";

import { loadActivePrices } from "@/lib/pricing/get-active-prices";
import { getBuilderPlanPolicy } from "@/lib/site-admin/builder-capabilities";
import { logServerError } from "@/lib/server/safe-error";

/**
 * page-lifter.ts — which plan the page-cap paywall should NAME, resolved from
 * the live catalog rather than typed into a string.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The page-cap denial message names the cheapest plan that lifts the cap. Both
 * ways of hard-coding that name are wrong, and we shipped one of them:
 *
 *   "Upgrade to Studio"  — Studio is $29 and Website is $12, and every paid
 *                          tier lifts the cap, so this cost a shop $17 a month
 *                          for capability it did not need.
 *   "…starting with Website" — correct on price, wrong on availability:
 *                          `product_tiers.website.is_active` is false today, so
 *                          the sentence would point at a plan whose checkout
 *                          refuses. A dead CTA.
 *
 * The name is therefore DERIVED: cheapest tier that is sellable right now AND
 * whose builder policy sets `maxPublicPages` to null. Today that resolves to
 * Studio, because Website cannot be bought. The day Website's tier flips
 * active, the same code starts saying Website, with no copy edit and no risk of
 * anyone forgetting there was a string to update.
 *
 * SELLABLE means what the marketing ladder means by it — `loadActivePrices`
 * already filters to active tiers, and we additionally require a real Stripe
 * price id, because a tier with no price is a tier checkout cannot start.
 */

/** Catalog tier slug → plan key, for the slugs where the two differ. */
const TIER_SLUG_TO_PLAN: Record<string, string> = {
  hub: "network",
};

/**
 * Display name of the cheapest sellable plan that lifts the public-page cap,
 * or null when none is sellable.
 *
 * Never throws: a catalog read failure yields null, and the caller's copy falls
 * back to plan-neutral wording. A broken price read must not produce a
 * confidently wrong upsell.
 */
export async function resolveCheapestPageLifterName(): Promise<string | null> {
  try {
    const catalog = await loadActivePrices("USD");

    let best: { name: string; cents: number } | null = null;

    for (const pkg of catalog.packages) {
      // Only the business ladder lifts a workspace page cap. The talent ladder
      // is a different product and naming "Pro" here would be nonsense.
      if (pkg.family !== "workspace") continue;

      for (const tier of pkg.tiers) {
        const planKey = TIER_SLUG_TO_PLAN[tier.slug] ?? tier.slug;

        // Does this plan actually lift the cap? Read the policy, do not assume
        // "paid means unlimited" — that coupling is exactly what would rot.
        if (getBuilderPlanPolicy(planKey).maxPublicPages !== null) continue;

        // Sellable: a monthly price with a real Stripe id. A tier with no
        // usable price cannot be checked out into, however active it looks.
        const monthly = tier.prices.find(
          (p) => p.interval === "month" && p.stripePriceId,
        );
        if (!monthly) continue;

        if (!best || monthly.unitAmount < best.cents) {
          best = { name: tier.name, cents: monthly.unitAmount };
        }
      }
    }

    return best?.name ?? null;
  } catch (err) {
    logServerError("site-admin.page-lifter.resolve", err);
    return null;
  }
}
