#!/usr/bin/env node
/**
 * seed-stripe-portal-config.mjs (TUL-834) · create the Billing Portal
 * configuration on the US and MX Stripe TEST sandboxes with every feature set
 * explicitly (never relying on Stripe defaults).
 *
 * Safety:
 *   - Refuses any Stripe key that does not start with `sk_test_`.
 *   - --dry-run is the DEFAULT. Pass --apply to create. Never prints keys.
 *   - Idempotent: a configuration carrying metadata.tulala_seed =
 *     "portal-config-v1" is reused, never duplicated.
 *
 * Features: invoice history, payment method update, cancel at period end,
 * plan switching with prorations over the products behind the plan lookup
 * keys, promotion codes. Customer address/name/tax updates are left off.
 *
 * Env: STRIPE_SECRET_KEY_TEST_US, STRIPE_SECRET_KEY_TEST_MX (either may be
 * unset). Prints the configuration id to put in STRIPE_PORTAL_CONFIGURATION_ID
 * (US) / STRIPE_MX_PORTAL_CONFIGURATION_ID (MX).
 * Usage: node scripts/seed-stripe-portal-config.mjs [--dry-run | --apply]
 */
import Stripe from "stripe";
import { LOOKUP_KEYS, SEED_TAG, buildPortalConfiguration } from "./lib/stripe-portal-config.mjs";

// The body lives in lib/stripe-portal-config.mjs (shared with the staging
// workflow runner); re-exported so existing importers keep working.
export { LOOKUP_KEYS, SEED_TAG, buildPortalConfiguration };

export function assertTestKey(name, key) {
  if (!key) return null;
  if (!key.startsWith("sk_test_")) {
    throw new Error(`${name} is not a TEST key (must start with sk_test_). Refusing.`);
  }
  return key;
}

async function resolveProducts(stripe) {
  const found = await stripe.prices.list({ lookup_keys: LOOKUP_KEYS, active: true, limit: 100 });
  const byProduct = new Map();
  for (const p of found.data) {
    const product = typeof p.product === "string" ? p.product : p.product.id;
    byProduct.set(product, [...(byProduct.get(product) ?? []), p.id]);
  }
  return [...byProduct].map(([product, prices]) => ({ product, prices }));
}

async function ensureOnSandbox(label, secret, dryRun) {
  const stripe = new Stripe(secret);
  console.log(`\n[${label}] sandbox`);
  const existing = (await stripe.billingPortal.configurations.list({ limit: 100 })).data.find(
    (c) => c.metadata?.tulala_seed === SEED_TAG,
  );
  if (existing) {
    console.log(`  portal configuration -> ${existing.id} (exists; not changed)`);
    return;
  }
  const products = await resolveProducts(stripe);
  if (products.length === 0) {
    console.log("  no plan prices found by lookup_key; run seed-stripe-test-prices first. Skipping.");
    return;
  }
  if (dryRun) {
    console.log(`  portal configuration -> (would create, ${products.length} products in plan switching)`);
    return;
  }
  const c = await stripe.billingPortal.configurations.create(buildPortalConfiguration(products));
  console.log(`  portal configuration -> ${c.id} (created)`);
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const us = assertTestKey("STRIPE_SECRET_KEY_TEST_US", process.env.STRIPE_SECRET_KEY_TEST_US);
  const mx = assertTestKey("STRIPE_SECRET_KEY_TEST_MX", process.env.STRIPE_SECRET_KEY_TEST_MX);
  if (!us && !mx) throw new Error("No Stripe TEST key set (STRIPE_SECRET_KEY_TEST_US / STRIPE_SECRET_KEY_TEST_MX).");
  if (dryRun) console.log("dry run (pass --apply to create)");
  if (us) await ensureOnSandbox("US", us, dryRun);
  if (mx) await ensureOnSandbox("MX", mx, dryRun);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`seed-stripe-portal-config: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
