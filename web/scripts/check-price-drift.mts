#!/usr/bin/env tsx
/**
 * check:price-drift — does the TypeScript plan catalog agree with the DB?
 *
 * WHY THIS EXISTS
 * ───────────────
 * On 2026-08-30 the two disagreed, badly and silently:
 *
 *   plan-catalog.ts           Studio $29/mo   Agency $79/mo
 *   product_prices (DB seed)  Studio $49/mo   Agency $149/mo
 *
 * The /pricing page reads the DB and only falls back to the TypeScript numbers,
 * and Stripe Checkout reads the DB row's price ID. So the DB is what a customer
 * is actually billed, while a dozen other surfaces quoted the TypeScript number.
 * Nothing failed. Nobody was told. The Tulala Agent is about to start
 * recommending plans out loud, which makes a wrong price a promise.
 *
 * WHY A DETECTOR RATHER THAN A FIX
 * ────────────────────────────────
 * `product_prices` rows carry live Stripe price IDs. Rewriting `unit_amount`
 * alone would make the display disagree with the actual charge — worse than the
 * drift it replaces. Reconciling means either creating new Stripe Price objects
 * at the intended amount and repointing the rows, or accepting the DB amount and
 * correcting every copy surface. Both are commercial calls with external side
 * effects, so this reports and refuses to guess.
 *
 * ALSO CHECKS tier reachability: a TS plan with a price but no current DB price
 * row cannot be sold at all. `website` is exactly that case — the DB catalog was
 * seeded before the Website tier existed, so the cheapest paid workspace plan
 * has no price row to check out against.
 *
 * EXIT CODES
 *   0  catalogs agree, or credentials absent outside CI
 *   1  a real mismatch, or a priced tier the DB cannot sell
 *
 * Run: npm run check:price-drift   (reads .env.local)
 */
import { PLAN_CATALOG, type PlanDef } from "../src/lib/access/plan-catalog";

if (process.env.SKIP_PRICE_DRIFT_CHECK === "1") {
  console.warn("[check-price-drift] SKIP_PRICE_DRIFT_CHECK=1 — skipping");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  if (process.env.CI === "true") {
    console.error(
      "[check-price-drift] FATAL: running in CI without NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }
  console.warn(
    "[check-price-drift] Supabase credentials missing — skipping. Run with .env.local to enforce.",
  );
  process.exit(0);
}

/**
 * TS plan key → DB `product_tiers.slug`, where they differ.
 *
 * The two catalogs were built at different times and never reconciled their
 * vocabularies either: the DB calls the top workspace tier `hub` where the TS
 * catalog says `network` (the plan key was deliberately left alone to avoid an
 * enum rename — see the comment on `network` in plan-catalog.ts), and the DB
 * talent tiers are `free`/`pro`/`max` against `talent_basic`/`talent_pro`/
 * `talent_portfolio`.
 */
const DB_TIER_SLUG: Partial<Record<string, string>> = {
  network: "hub",
  talent_basic: "free",
  talent_pro: "pro",
  talent_portfolio: "max",
};

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type PriceRow = {
  unit_amount: number;
  stripe_price_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  product_tiers: {
    slug: string;
    product_packages: { slug: string } | null;
  } | null;
};

const { data, error } = await supabase
  .from("product_prices")
  .select(
    "unit_amount, stripe_price_id, valid_from, valid_until, product_tiers!inner(slug, product_packages!inner(slug))",
  )
  .is("archived_at", null)
  .eq("currency", "USD")
  .eq("interval", "month");

if (error) {
  console.error("[check-price-drift] could not read product_prices:", error.message);
  process.exit(1);
}

/** Current monthly USD price per `<package>/<tier>`. */
const dbPrices = new Map<string, { cents: number; stripePriceId: string | null }>();
for (const row of (data ?? []) as unknown as PriceRow[]) {
  const tierSlug = row.product_tiers?.slug;
  const pkgSlug = row.product_tiers?.product_packages?.slug;
  if (!tierSlug || !pkgSlug) continue;
  // Scheduled or expiring rows are not the current price.
  if (row.valid_from || row.valid_until) continue;
  dbPrices.set(`${pkgSlug}/${tierSlug}`, {
    cents: row.unit_amount,
    stripePriceId: row.stripe_price_id,
  });
}

const problems: string[] = [];
const agreed: string[] = [];

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}/mo`;

for (const plan of Object.values(PLAN_CATALOG) as PlanDef[]) {
  // Sales-led tiers carry no listed price; free tiers legitimately have no
  // product_prices row; archived tiers are not sold to anyone new.
  if (plan.monthlyPriceCents == null || plan.monthlyPriceCents === 0) continue;
  if (plan.isArchived) continue;

  const pkg = plan.audience; // "workspace" | "talent" — matches product_packages.slug
  const dbKey = `${pkg}/${DB_TIER_SLUG[plan.key] ?? plan.key}`;
  const dbRow = dbPrices.get(dbKey);

  if (!dbRow) {
    problems.push(
      `UNSELLABLE      ${plan.audience}/${plan.key} (${plan.displayName}) — plan-catalog says ${dollars(plan.monthlyPriceCents)}, but no current USD monthly product_prices row exists at "${dbKey}". Checkout has no price to charge.`,
    );
    continue;
  }

  if (dbRow.cents !== plan.monthlyPriceCents) {
    problems.push(
      `PRICE MISMATCH  ${dbKey} (${plan.displayName}) — plan-catalog ${dollars(plan.monthlyPriceCents)} vs DB ${dollars(dbRow.cents)} (stripe_price_id ${dbRow.stripePriceId ?? "none"}). The DB row is what Checkout bills.`,
    );
    continue;
  }

  agreed.push(dbKey);
}

if (problems.length === 0) {
  console.log(
    `[check-price-drift] OK — ${agreed.length} priced tier(s) agree between plan-catalog.ts and product_prices`,
  );
  process.exit(0);
}

console.error(`\n[check-price-drift] FAILED — ${problems.length} problem(s):\n`);
for (const p of problems) console.error(`  • ${p}`);
console.error(
  [
    "",
    "This is a COMMERCIAL decision, not a code fix. Pick one:",
    "  (a) the plan-catalog amount is right → create Stripe Prices at that amount,",
    "      repoint product_prices.stripe_price_id, archive the superseded rows;",
    "  (b) the DB amount is right → correct plan-catalog.ts and every copy surface",
    "      (plan-tiers.ts, messages/{en,es}.json, guest-corpus.ts, help-guides.ts,",
    "       account-drawer-content.tsx).",
    "",
    "Do NOT edit product_prices.unit_amount alone: the row's Stripe price is what",
    "actually charges the card, so that makes the display lie instead of the copy.",
    "",
    "Override (with a reason): SKIP_PRICE_DRIFT_CHECK=1",
    "",
  ].join("\n"),
);
process.exit(1);
