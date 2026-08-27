import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTERVAL_COLUMN,
  TALENT_TIER_SLUG,
  WORKSPACE_TIER_SLUG,
} from "./price-catalog";

/**
 * Checkout resolves Stripe prices from the `product_prices` catalog, not from
 * `STRIPE_PRICE_*` environment variables. These tests hold that line.
 *
 * The env-var era is why the 2026 repricing was dangerous: marketing read the
 * DB while checkout read env, so the site could advertise one price while
 * checkout billed another — or billed on a different Stripe account entirely.
 */

test("every workspace plan key maps to a tier slug (or an explicit null)", () => {
  // A missing key would make the resolver return null and silently refuse
  // checkout for a plan that is supposed to be purchasable.
  assert.deepEqual(Object.keys(WORKSPACE_TIER_SLUG).sort(), [
    "agency",
    "network",
    "studio",
    "website",
  ]);
  // Network is sales-assisted: null is the intended value, not an oversight.
  assert.equal(WORKSPACE_TIER_SLUG.network, null);
  assert.equal(WORKSPACE_TIER_SLUG.studio, "studio");
});

test("talent plan keys map to their historical tier slugs", () => {
  // `max` is the slug behind the tier DISPLAYED as "Portfolio". Renaming the
  // slug would orphan every subscription row that references it.
  assert.equal(TALENT_TIER_SLUG.talent_portfolio, "max");
  assert.equal(TALENT_TIER_SLUG.talent_pro, "pro");
  assert.deepEqual(Object.keys(TALENT_TIER_SLUG).sort(), [
    "talent_portfolio",
    "talent_pro",
  ]);
});

test("billing intervals map to the catalog's interval vocabulary", () => {
  // product_prices.interval is CHECK-constrained to month/year/once/lifetime.
  assert.equal(INTERVAL_COLUMN.monthly, "month");
  assert.equal(INTERVAL_COLUMN.annual, "year");
});

test("no source file reads a STRIPE_PRICE_* environment variable", () => {
  // The drift tripwire. If someone reintroduces an env price lookup, checkout
  // and the pricing dashboard become two sources of truth again.
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (full.endsWith("price-ids.test.ts")) continue;
      const text = readFileSync(full, "utf8");
      // Match an actual env read, not prose mentioning the old variable names.
      if (/process\.env\s*(\.\s*STRIPE_PRICE_|\[\s*["'`]STRIPE_PRICE_)/.test(text)) {
        offenders.push(full);
      }
    }
  };
  walk("src");
  assert.deepEqual(
    offenders,
    [],
    `Checkout prices must come from product_prices, not env: ${offenders.join(", ")}`,
  );
});
