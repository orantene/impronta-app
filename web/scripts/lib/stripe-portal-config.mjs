/**
 * The Billing Portal configuration body (TUL-834), dependency free so both
 * scripts/seed-stripe-portal-config.mjs (Stripe SDK) and the staging workflow
 * runner scripts/stripe-staging-webhook.mjs (plain fetch, no node_modules)
 * build the SAME configuration.
 *
 * Features: invoice history, payment method update, cancel at period end (no
 * proration), plan switching with prorations over the products behind the plan
 * lookup keys, no pause, no customer address/name/tax updates. A configuration
 * carrying metadata.tulala_seed = SEED_TAG is reused, never duplicated.
 */

export const SEED_TAG = "portal-config-v1";
const PLAN_KEYS = ["talent_pro", "talent_portfolio", "website", "studio", "agency"];
export const LOOKUP_KEYS = PLAN_KEYS.flatMap((p) => ["month", "year"].map((i) => `tulala_${p}_${i}_usd`));

/** Pure: the portal configuration body, given the resolved products. */
export function buildPortalConfiguration(products) {
  return {
    name: "Tulala billing portal",
    metadata: { tulala_seed: SEED_TAG },
    business_profile: { headline: "Manage your Tulala plan" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: false },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products,
      },
      subscription_pause: { enabled: false },
    },
  };
}

/** Pure: group active plan prices (found by LOOKUP_KEYS) into portal products. */
export function productsFromPrices(prices) {
  const byProduct = new Map();
  for (const p of prices ?? []) {
    if (p.active === false) continue;
    const product = typeof p.product === "string" ? p.product : p.product?.id;
    if (!product) continue;
    byProduct.set(product, [...(byProduct.get(product) ?? []), p.id]);
  }
  return [...byProduct].map(([product, ids]) => ({ product, prices: ids }));
}
