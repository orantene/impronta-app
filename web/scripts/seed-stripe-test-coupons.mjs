#!/usr/bin/env node
/**
 * seed-stripe-test-coupons.mjs (TUL-833) · create or look up Stripe TEST
 * coupons + promotion codes for subscription promo QA. Idempotent: a coupon is
 * reused by its fixed id, a promotion code by its code string.
 *
 *   tulala_test_20pct_3m  20% off, repeating 3 months   -> TESTPRO20
 *   tulala_test_free_1m   100% off, repeating 1 month   -> TESTFREE1M
 *
 * Safety:
 *   - Refuses any Stripe key that does not start with `sk_test_`.
 *   - DRY RUN BY DEFAULT: nothing is written unless `--apply` is passed.
 *   - Never prints keys. Prints coupon / promotion code ids only.
 *
 * Env: STRIPE_SECRET_KEY_TEST_US, STRIPE_SECRET_KEY_TEST_MX (either may be unset).
 * Usage: node scripts/seed-stripe-test-coupons.mjs [--dry-run] [--apply]
 */
import Stripe from "stripe";

export const PLANNED_COUPONS = [
  { id: "tulala_test_20pct_3m", name: "Tulala TEST 20% x 3 months", percent_off: 20, duration: "repeating", duration_in_months: 3, code: "TESTPRO20" },
  { id: "tulala_test_free_1m", name: "Tulala TEST 100% first month", percent_off: 100, duration: "repeating", duration_in_months: 1, code: "TESTFREE1M" },
];

export function assertTestKey(name, key) {
  if (!key) return null;
  if (!key.startsWith("sk_test_")) {
    throw new Error(`${name} is not a TEST key (must start with sk_test_). Refusing.`);
  }
  return key;
}

/** Writes happen only with an explicit --apply; --dry-run always wins. */
export function shouldApply(argv) {
  return argv.includes("--apply") && !argv.includes("--dry-run");
}

async function ensureOnSandbox(label, secret, apply) {
  const stripe = new Stripe(secret);
  console.log(`\n[${label}] sandbox${apply ? "" : " (dry run)"}`);
  for (const c of PLANNED_COUPONS) {
    let coupon = null;
    try {
      coupon = await stripe.coupons.retrieve(c.id);
    } catch (err) {
      if (err?.code !== "resource_missing") throw err;
    }
    if (!coupon) {
      if (!apply) {
        console.log(`  coupon ${c.id} -> (would create)`);
      } else {
        coupon = await stripe.coupons.create({
          id: c.id,
          name: c.name,
          percent_off: c.percent_off,
          duration: c.duration,
          duration_in_months: c.duration_in_months,
          metadata: { source: "seed-stripe-test-coupons" },
        });
        console.log(`  coupon ${c.id} -> ${coupon.id} (created)`);
      }
    } else {
      console.log(`  coupon ${c.id} -> ${coupon.id}`);
    }
    const found = await stripe.promotionCodes.list({ code: c.code, limit: 1 });
    if (found.data[0]) {
      console.log(`  promo ${c.code} -> ${found.data[0].id}`);
    } else if (!apply || !coupon) {
      console.log(`  promo ${c.code} -> (would create)`);
    } else {
      const promo = await stripe.promotionCodes.create({
        // stripe@22 API: promotion codes reference the coupon via `promotion`.
        promotion: { type: "coupon", coupon: coupon.id },
        code: c.code,
        metadata: { source: "seed-stripe-test-coupons" },
      });
      console.log(`  promo ${c.code} -> ${promo.id} (created)`);
    }
  }
}

async function main() {
  const apply = shouldApply(process.argv);
  const us = assertTestKey("STRIPE_SECRET_KEY_TEST_US", process.env.STRIPE_SECRET_KEY_TEST_US);
  const mx = assertTestKey("STRIPE_SECRET_KEY_TEST_MX", process.env.STRIPE_SECRET_KEY_TEST_MX);
  if (!us && !mx) throw new Error("No Stripe TEST key set (STRIPE_SECRET_KEY_TEST_US / STRIPE_SECRET_KEY_TEST_MX).");
  if (us) await ensureOnSandbox("US", us, apply);
  if (mx) await ensureOnSandbox("MX", mx, apply);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`seed-stripe-test-coupons: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
