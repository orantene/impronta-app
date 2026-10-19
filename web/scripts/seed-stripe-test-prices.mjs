#!/usr/bin/env node
/**
 * seed-stripe-test-prices.mjs (TUL-830) · create or look up the plan catalog's
 * Stripe TEST prices on the US and MX sandboxes, by lookup_key. Idempotent:
 * a price whose lookup_key already exists is reused, never duplicated.
 *
 * Amounts come ONLY from the existing catalog (`product_prices`, canonical USD
 * rows: active, unarchived, no sale window, on an active tier). Nothing is
 * invented: a tier with no catalog amount for an interval gets no price, and
 * yearly is created only where the catalog has a yearly amount.
 *
 * Safety:
 *   - Refuses any Stripe key that does not start with `sk_test_`.
 *   - Never prints keys. Prints lookup_key -> price id only.
 *   - Reads the catalog read-only; it never writes `product_prices`. Copy the
 *     printed ids into the catalog through the Platform HQ pricing dashboard.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (catalog read),
 *      STRIPE_SECRET_KEY_TEST_US (US "Lavender Tunnel" sandbox), STRIPE_SECRET_KEY_TEST_MX (MX test sandbox); either may be unset.
 *
 * Workflow mode (.github/workflows/stripe-test-seed.yml): `--static-catalog` reads NO database. It uses
 * the fixed plan amounts in scripts/lib/stripe-test-seed.mjs (STATIC_AMOUNTS), one key from
 * STRIPE_SECRET_KEY, and `--out <file>` writes ONLY id, lookup_key, livemode, interval, currency.
 * Usage: node scripts/seed-stripe-test-prices.mjs [--dry-run] [--static-catalog --out <file>]
 */
import { writeFileSync } from "node:fs";
import Stripe from "stripe";
import { PLAN_ROWS, STATIC_AMOUNTS } from "./lib/stripe-test-seed.mjs";

/** Plan key -> product_tiers.slug (mirrors src/lib/stripe/price-catalog.ts). */
export const PLAN_TIER_SLUGS = {
  talent_pro: "pro",
  talent_portfolio: "max",
  website: "website",
  studio: "studio",
  agency: "agency",
};

export function lookupKeyFor(planKey, interval) {
  return `tulala_${planKey}_${interval}_usd`;
}

export function assertTestKey(name, key) {
  if (!key) return null;
  if (!key.startsWith("sk_test_")) {
    throw new Error(`${name} is not a TEST key (must start with sk_test_). Refusing.`);
  }
  return key;
}

/** Canonical catalog rows -> the prices to ensure. Pure. */
export function plannedPrices(tiers, prices) {
  const slugToPlan = Object.fromEntries(Object.entries(PLAN_TIER_SLUGS).map(([p, s]) => [s, p]));
  const tierById = new Map(tiers.filter((t) => t.is_active && slugToPlan[t.slug]).map((t) => [t.id, t]));
  const out = [];
  for (const row of prices) {
    const tier = tierById.get(row.tier_id);
    if (!tier) continue;
    if (row.currency !== "USD" || row.valid_from !== null || row.valid_until !== null) continue;
    if (row.interval !== "month" && row.interval !== "year") continue;
    if (!Number.isInteger(row.unit_amount) || row.unit_amount <= 0) continue;
    const planKey = slugToPlan[tier.slug];
    out.push({ planKey, tierSlug: tier.slug, tierName: tier.name, interval: row.interval, unitAmount: row.unit_amount, lookupKey: lookupKeyFor(planKey, row.interval) });
  }
  return out.sort((a, b) => a.lookupKey.localeCompare(b.lookupKey));
}

/** The workflow's catalog: the fixed amounts, no database. Pure. */
export function staticPlanned() {
  const out = [];
  for (const r of PLAN_ROWS) {
    const amount = STATIC_AMOUNTS[r.key];
    if (!amount) continue;
    out.push({ planKey: r.plan, tierSlug: PLAN_TIER_SLUGS[r.plan], tierName: undefined, interval: r.interval, unitAmount: amount, lookupKey: lookupKeyFor(r.plan, r.interval) });
  }
  return out.sort((a, b) => a.lookupKey.localeCompare(b.lookupKey));
}

/** Reduce a Stripe price to the only fields the artifact may carry. */
export function artifactEntry(price, lookupKey) {
  return { id: price.id, lookup_key: lookupKey, livemode: price.livemode, interval: price.recurring?.interval, currency: price.currency };
}

async function readCatalog() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read the catalog.");
  const get = async (path) => {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/${path}`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`catalog read failed: ${path.split("?")[0]} ${res.status}`);
    return res.json();
  };
  const tiers = await get("product_tiers?select=id,slug,name,is_active");
  const prices = await get("product_prices?select=tier_id,currency,interval,unit_amount,valid_from,valid_until&is_active=eq.true&archived_at=is.null");
  return { tiers, prices };
}

async function ensureOnSandbox(label, secret, planned, dryRun, collected) {
  const stripe = new Stripe(secret);
  console.log(`\n[${label}] sandbox`);
  for (const p of planned) {
    const found = await stripe.prices.list({ lookup_keys: [p.lookupKey], limit: 1 });
    const existing = found.data[0];
    if (existing) {
      collected?.push(artifactEntry(existing, p.lookupKey));
      const same = existing.unit_amount === p.unitAmount && existing.recurring?.interval === p.interval;
      console.log(`  ${p.lookupKey} -> ${existing.id}${same ? "" : "  (WARNING: amount/interval differs from catalog; not changed)"}`);
      continue;
    }
    if (dryRun) {
      console.log(`  ${p.lookupKey} -> (would create ${p.unitAmount} usd / ${p.interval})`);
      continue;
    }
    const productId = `tulala_plan_${p.planKey}`;
    try {
      await stripe.products.retrieve(productId);
    } catch {
      await stripe.products.create({ id: productId, name: `Tulala ${p.tierName ?? p.planKey}`, metadata: { plan_key: p.planKey, tier_slug: p.tierSlug } });
    }
    const price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: p.unitAmount,
      recurring: { interval: p.interval },
      lookup_key: p.lookupKey,
      metadata: { plan_key: p.planKey, tier_slug: p.tierSlug, source: "seed-stripe-test-prices" },
    });
    collected?.push(artifactEntry(price, p.lookupKey));
    console.log(`  ${p.lookupKey} -> ${price.id} (created)`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (process.argv.includes("--static-catalog")) {
    const key = assertTestKey("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    const oi = process.argv.indexOf("--out");
    const outFile = oi >= 0 ? process.argv[oi + 1] : null;
    const collected = [];
    await ensureOnSandbox("TEST", key, staticPlanned(), dryRun, collected);
    if (collected.some((e) => e.livemode !== false)) throw new Error("a price is not livemode=false; refusing to write the artifact.");
    if (outFile && !dryRun) writeFileSync(outFile, JSON.stringify(collected, null, 2));
    return;
  }
  const us = assertTestKey("STRIPE_SECRET_KEY_TEST_US", process.env.STRIPE_SECRET_KEY_TEST_US);
  const mx = assertTestKey("STRIPE_SECRET_KEY_TEST_MX", process.env.STRIPE_SECRET_KEY_TEST_MX);
  if (!us && !mx) throw new Error("No Stripe TEST key set (STRIPE_SECRET_KEY_TEST_US / STRIPE_SECRET_KEY_TEST_MX).");
  const { tiers, prices } = await readCatalog();
  const planned = plannedPrices(tiers, prices);
  if (planned.length === 0) {
    console.log("Catalog has no canonical USD plan amounts; nothing to create.");
    return;
  }
  if (us) await ensureOnSandbox("US", us, planned, dryRun);
  if (mx) await ensureOnSandbox("MX", mx, planned, dryRun);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`seed-stripe-test-prices: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
