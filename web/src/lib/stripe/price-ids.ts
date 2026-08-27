/**
 * lib/stripe/price-ids.ts — the plan-key vocabulary shared by billing code.
 *
 * This file USED to map plan keys to Stripe Price IDs through ten
 * `STRIPE_PRICE_*` environment variables. It no longer does: checkout resolves
 * prices from the `product_prices` catalog (see `price-catalog.ts`), so the
 * Platform HQ pricing dashboard is the single source of truth and a price
 * change never needs an env edit or a redeploy.
 *
 * Env now holds only what cannot live in a database the app reads: the Stripe
 * API credentials (`STRIPE_SECRET_KEY`, the publishable key, the webhook
 * secret).
 *
 * Only the type vocabulary remains here, kept in its own module so the plan
 * unions have one definition site.
 */

export type BillingInterval = "monthly" | "annual";

/**
 * Workspace (business) plans that can carry a Stripe subscription. `network` is
 * sales-assisted and deliberately has no catalog price; `free` is absent
 * because it never reaches Stripe.
 */
export type WorkspacePlanKey = "website" | "studio" | "agency" | "network";

/** Paid talent plans. `talent_basic` (Free) is absent — it never bills. */
export type TalentPlanKey = "talent_pro" | "talent_portfolio";
