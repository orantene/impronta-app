#!/usr/bin/env node
/**
 * Seed Stripe TEST price ids into `product_prices` on STAGING (fxlank) only.
 * Runbook: docs/plans/stripe-test-seed-runbook-2026-10-18.md.
 * Mirrors supabase/seed-staging-notes/stripe_test_product_prices.sql, with the
 * amount taken from the Stripe TEST price itself instead of a placeholder.
 *
 *   DRY RUN (default): reads Stripe + the DB, writes nothing, prints the plan.
 *   --apply            one transaction: UPDATE the canonical row or INSERT, then read back.
 *   --cleanup          undo this runner's writes (needs --backup-file from the apply).
 *
 * --ids-file <json>  the stripe-test-seed workflow artifact (every entry livemode:false). With it NO
 *                     Stripe key is required or read and Stripe is not called; amounts are the catalog's.
 *
 * Needs: DATABASE_URL (login postgres.fxlankepwnvelxjrahwk), STRIPE_SECRET_KEY or
 * --stripe-key-file (sk_test_...), and the TEST price ids (flags or STRIPE_TEST_PRICE_* env).
 * Refuses on any guard failure with exit 2 and writes nothing. Never prints a key or a URL.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  PLAN_ROWS, SEED_NOTE, parseIdsFile, checkAccountResponse, checkDbLogin, checkStripeKey,
  checkStripePrice, envMentioningProd, parseArgs, planAction, validatePriceIds,
} from "./lib/stripe-test-seed.mjs";

function refuse(msg) {
  console.error(`[stripe-test-seed] REFUSED: ${msg}`);
  process.exit(2);
}

async function stripeGet(path, key) {
  const res = await fetch(`https://api.stripe.com${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 404) return null;
  if (!res.ok) refuse(`Stripe ${path.split("?")[0].replace(/price_\w+/, "price_...")} answered ${res.status}`);
  return res.json();
}

const args = parseArgs(process.argv.slice(2), process.env);
if (args.errors.length) refuse(args.errors.join("; "));

// 1) database login
const databaseUrl = process.env.DATABASE_URL;
const login = checkDbLogin(databaseUrl);
if (!login.ok) refuse(login.reason);

// 2) nothing may mention production
const prodMentions = envMentioningProd(process.env);
if (prodMentions.length) refuse(`these env vars mention the production project: ${prodMentions.join(", ")}`);

// 3) Stripe key: test mode only (not read at all with --ids-file)
let key = "";
let idsAmounts = null;
if (args.idsFile) {
  if (!existsSync(args.idsFile)) refuse("--ids-file does not exist");
  const parsed = parseIdsFile(readFileSync(args.idsFile, "utf8"));
  if (parsed.errors.length) refuse(parsed.errors.join("; "));
  args.prices = parsed.prices;
  idsAmounts = parsed.amounts;
} else {
  key = process.env.STRIPE_SECRET_KEY ?? "";
  if (args.stripeKeyFile) {
    if (!existsSync(args.stripeKeyFile)) refuse("--stripe-key-file does not exist");
    key = readFileSync(args.stripeKeyFile, "utf8").trim();
  }
  const keyCheck = checkStripeKey(key);
  if (!keyCheck.ok) refuse(keyCheck.reason);
}

// 4) price ids
if (!args.cleanup) {
  const problems = validatePriceIds(args.prices);
  if (problems.length) refuse(problems.join("; "));
}
if (args.apply && args.cleanup) refuse("--apply and --cleanup are separate runs");
if (args.apply && !args.backupFile) refuse("--apply needs --backup-file <path> (it records what it replaces, for --cleanup)");
if (args.cleanup && (!args.backupFile || !existsSync(args.backupFile))) refuse("--cleanup needs the --backup-file written by the --apply");

// 5) Stripe says test mode, and each price is what we think it is
if (!args.idsFile) {
  const account = await stripeGet("/v1/account", key);
  const acct = checkAccountResponse(account);
  if (!acct.ok) refuse(acct.reason);
}

const wanted = [];
if (!args.cleanup) {
  const bad = [];
  for (const row of PLAN_ROWS) {
    const id = args.prices[row.key];
    if (!id) continue;
    if (idsAmounts) {
      wanted.push({ ...row, stripe_price_id: id, unit_amount: idsAmounts[row.key] });
      continue;
    }
    const price = await stripeGet(`/v1/prices/${encodeURIComponent(id)}`, key);
    bad.push(...checkStripePrice(row, price));
    if (price) wanted.push({ ...row, stripe_price_id: id, unit_amount: price.unit_amount });
  }
  if (bad.length) refuse(bad.join("; "));
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const canonicalSql = `select pp.id, pp.stripe_price_id, pp.unit_amount, pp.notes
  from public.product_prices pp
  join public.product_tiers t on t.id = pp.tier_id
  join public.product_packages p on p.id = t.package_id
  where p.slug = $1 and t.slug = $2 and pp.currency = 'USD' and pp.interval = $3
    and pp.is_active and pp.archived_at is null and pp.valid_from is null and pp.valid_until is null`;
const tierSql = `select t.id, t.is_active from public.product_tiers t join public.product_packages p on p.id = t.package_id where p.slug = $1 and t.slug = $2`;

try {
  if (args.cleanup) {
    const backup = JSON.parse(readFileSync(args.backupFile, "utf8"));
    await client.query("BEGIN");
    let removed = 0;
    let restored = 0;
    for (const e of backup.entries) {
      if (e.action === "insert") {
        const r = await client.query("delete from public.product_prices where id = $1 and notes = $2", [e.id, SEED_NOTE]);
        removed += r.rowCount ?? 0;
      } else if (e.action === "update") {
        const r = await client.query(
          "update public.product_prices set stripe_price_id = $2, unit_amount = $3, updated_at = now() where id = $1 and stripe_price_id = $4",
          [e.id, e.before.stripe_price_id, e.before.unit_amount, e.after.stripe_price_id],
        );
        restored += r.rowCount ?? 0;
      }
    }
    await client.query("COMMIT");
    console.log(`[stripe-test-seed] cleanup: ${removed} created row(s) deleted, ${restored} updated row(s) restored (only this runner's rows)`);
    process.exit(0);
  }

  await client.query(args.apply ? "BEGIN" : "BEGIN READ ONLY");
  const plan = [];
  const missingTiers = [];
  for (const w of wanted) {
    const tier = (await client.query(tierSql, [w.pkg, w.tier])).rows[0];
    if (!tier) { missingTiers.push(`${w.pkg}.${w.tier}`); continue; }
    const existing = (await client.query(canonicalSql, [w.pkg, w.tier, w.interval])).rows[0];
    plan.push({ ...w, tier_id: tier.id, tier_active: tier.is_active, existing, ...planAction(existing, w) });
  }
  const tiersMissing = [...new Set(missingTiers)];
  console.log(`[stripe-test-seed] ${args.apply ? "APPLY" : "DRY RUN"}  db login ${login.user}  ${args.idsFile ? "ids file, every entry livemode=false" : "stripe account livemode=false"}`);
  for (const p of plan) {
    const cur = p.existing ? `row ${p.existing.id} has ${p.existing.stripe_price_id ?? "no price id"}` : "no canonical row";
    console.log(`  ${p.plan.padEnd(17)} ${p.pkg}.${p.tier} ${p.interval.padEnd(5)} -> ${p.stripe_price_id}  ${p.unit_amount}c  [${p.action}]  (${cur})${p.tier_active ? "" : "  !! tier is INACTIVE, checkout ignores it"}`);
  }
  if (tiersMissing.length) {
    await client.query("ROLLBACK");
    refuse(`tier(s) not in this database: ${tiersMissing.join(", ")} (nothing written)`);
  }

  if (!args.apply) {
    await client.query("ROLLBACK");
    console.log("[stripe-test-seed] dry run only, nothing written. Re-run with --apply --backup-file <path> to write.");
    process.exit(0);
  }

  const entries = [];
  for (const p of plan) {
    if (p.action === "unchanged") continue;
    if (p.action === "update") {
      await client.query("update public.product_prices set stripe_price_id = $2, unit_amount = $3, updated_at = now() where id = $1", [p.existing.id, p.stripe_price_id, p.unit_amount]);
      entries.push({ action: "update", id: p.existing.id, before: { stripe_price_id: p.existing.stripe_price_id, unit_amount: p.existing.unit_amount }, after: { stripe_price_id: p.stripe_price_id } });
    } else {
      const r = await client.query(
        "insert into public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id, notes) values ($1, 'USD', $2, $3, $4, $5) returning id",
        [p.tier_id, p.interval, p.unit_amount, p.stripe_price_id, SEED_NOTE],
      );
      entries.push({ action: "insert", id: r.rows[0].id });
    }
  }
  // the backup is written BEFORE the commit so a crash after commit still leaves the undo record
  writeFileSync(args.backupFile, JSON.stringify({ at: new Date().toISOString(), entries }, null, 2), { mode: 0o600 });
  await client.query("COMMIT");

  const check = await client.query(
    `select p.slug pkg, t.slug tier, pp.interval, pp.unit_amount, pp.stripe_price_id, pp.id
     from public.product_prices pp join public.product_tiers t on t.id = pp.tier_id join public.product_packages p on p.id = t.package_id
     where pp.currency = 'USD' and pp.is_active and pp.archived_at is null and pp.valid_from is null and pp.valid_until is null
       and (p.slug, t.slug) in (${[...new Set(plan.map((p) => `('${p.pkg}','${p.tier}')`))].join(",")})
     order by p.slug, t.slug, pp.interval`,
  );
  console.log("[stripe-test-seed] read-back (what checkout will resolve):");
  for (const r of check.rows) console.log(`  ${r.pkg}.${r.tier} ${r.interval}  ${r.stripe_price_id}  ${r.unit_amount}c  row ${r.id}`);
  console.log("[stripe-test-seed] plan -> price id:");
  for (const p of plan) console.log(`  ${p.plan} (${p.interval}) = ${p.stripe_price_id}`);
  console.log(`[stripe-test-seed] wrote ${entries.length} row(s); undo with --cleanup --backup-file ${args.backupFile}`);
} catch (e) {
  try { await client.query("ROLLBACK"); } catch { /* connection may be gone */ }
  console.error(`[stripe-test-seed] FAILED: ${e instanceof Error ? e.message : "unknown error"} (rolled back)`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
