import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAN_ROWS, STAGING_DB_USER, checkAccountResponse, checkDbLogin, checkStripeKey, checkStripePrice,
  envMentioningProd, envName, flagName, parseArgs, parseIdsFile, planAction, rowKeyForLookup, STATIC_AMOUNTS, validatePriceIds,
} from "./stripe-test-seed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Synthetic, assembled at runtime so no key-shaped literal sits in the source.
const TEST_KEY = ["sk", "test", "A1b2C3d4E5f6G7h8"].join("_");
const LIVE_KEY = ["sk", "live", "A1b2C3d4E5f6G7h8"].join("_");
const RK_LIVE = ["rk", "live", "A1b2C3d4E5f6G7h8"].join("_");
const RK_TEST = ["rk", "test", "A1b2C3d4E5f6G7h8"].join("_");

const goodPrices = () => Object.fromEntries(PLAN_ROWS.filter((r) => !r.optional).map((r, i) => [r.key, `price_Test${String(i).padStart(10, "0")}`]));

test("DB guard: only postgres.fxlankepwnvelxjrahwk passes", () => {
  assert.equal(checkDbLogin(`postgresql://${STAGING_DB_USER}:pw@aws-0.pooler.supabase.com:6543/postgres`).ok, true);
  for (const bad of [
    "postgresql://postgres.pluhdapdnuiulvxmyspd:pw@aws-0.pooler.supabase.com:6543/postgres",
    "postgresql://postgres:pw@db.fxlankepwnvelxjrahwk.supabase.co:5432/postgres",
    "postgresql://postgres.fxlankepwnvelxjrahwkx:pw@h/postgres",
    "not a url",
    "",
    undefined,
  ]) assert.equal(checkDbLogin(bad).ok, false, String(bad));
});

test("prod guard: any env value mentioning the production ref is named, never echoed", () => {
  const hits = envMentioningProd({ A: "x", NEXT_PUBLIC_SUPABASE_URL: "https://pluhdapdnuiulvxmyspd.supabase.co", B: "pluhdapdnuiulvxmyspd" });
  assert.deepEqual(hits, ["B", "NEXT_PUBLIC_SUPABASE_URL"]);
  assert.deepEqual(envMentioningProd({ A: "fxlankepwnvelxjrahwk" }), []);
});

test("Stripe key guard: only sk_test_ passes; live, restricted, empty and junk are refused without echoing the key", () => {
  assert.equal(checkStripeKey(TEST_KEY).ok, true);
  for (const bad of [LIVE_KEY, RK_LIVE, RK_TEST, "", "   ", undefined, "sk_test_", "pk_test_A1b2C3d4E5f6G7h8", "whsec_A1b2C3d4E5f6G7h8"]) {
    const r = checkStripeKey(bad);
    assert.equal(r.ok, false, String(bad));
    assert.ok(!String(r.reason).includes("A1b2C3d4E5f6G7h8"), "reason must not echo the key");
  }
});

test("live-mode refusal: Stripe /v1/account and each price must say livemode=false", () => {
  assert.equal(checkAccountResponse({ livemode: false }).ok, true);
  for (const bad of [{ livemode: true }, {}, null, undefined, { livemode: "false" }]) assert.equal(checkAccountResponse(bad).ok, false);
  const row = PLAN_ROWS[0];
  const good = { livemode: false, active: true, currency: "usd", type: "recurring", recurring: { interval: "month", interval_count: 1 }, unit_amount: 900 };
  assert.deepEqual(checkStripePrice(row, good), []);
  assert.ok(checkStripePrice(row, { ...good, livemode: true }).length > 0, "live price refused");
  assert.ok(checkStripePrice(row, undefined).length > 0, "unknown price refused");
});

test("price checks: interval, currency, type, activity and count must match the row", () => {
  const row = PLAN_ROWS.find((r) => r.key === "talent_max_year");
  const good = { livemode: false, active: true, currency: "usd", type: "recurring", recurring: { interval: "year", interval_count: 1 }, unit_amount: 15000 };
  assert.deepEqual(checkStripePrice(row, good), []);
  assert.ok(checkStripePrice(row, { ...good, recurring: { interval: "month", interval_count: 1 } }).some((p) => /interval/.test(p)));
  assert.ok(checkStripePrice(row, { ...good, currency: "mxn" }).some((p) => /currency/.test(p)));
  assert.ok(checkStripePrice(row, { ...good, type: "one_time", recurring: null }).length > 0);
  assert.ok(checkStripePrice(row, { ...good, active: false }).some((p) => /archived/.test(p)));
  assert.ok(checkStripePrice(row, { ...good, recurring: { interval: "year", interval_count: 3 } }).some((p) => /interval_count/.test(p)));
  assert.ok(checkStripePrice(row, { ...good, unit_amount: null }).some((p) => /unit_amount/.test(p)));
});

test("price id shape: wrong shape, missing required, one-sided website and duplicates are refused", () => {
  assert.deepEqual(validatePriceIds(goodPrices()), []);
  assert.ok(validatePriceIds({ ...goodPrices(), talent_pro_month: "prod_123456789" }).some((p) => /not a price id/.test(p)));
  assert.ok(validatePriceIds({ ...goodPrices(), talent_pro_month: "price_" }).length > 0);
  assert.ok(validatePriceIds({ ...goodPrices(), talent_pro_month: "price_has space1234" }).length > 0);
  const missing = goodPrices();
  delete missing.workspace_agency_year;
  assert.ok(validatePriceIds(missing).some((p) => /missing --workspace-agency-year/.test(p)));
  assert.ok(validatePriceIds({ ...goodPrices(), workspace_website_month: "price_WebMonth0001" }).some((p) => /website/.test(p)));
  assert.deepEqual(validatePriceIds({ ...goodPrices(), workspace_website_month: "price_WebMonth0001", workspace_website_year: "price_WebYear00001" }), []);
  const dup = goodPrices();
  dup.talent_pro_year = dup.talent_pro_month;
  assert.ok(validatePriceIds(dup).some((p) => /same price id/.test(p)));
});

test("argument parsing: flags, env fallback, unknown flags are errors", () => {
  const a = parseArgs(["--apply", "--backup-file", "b.json", "--talent-pro-month=price_AAAAAAAA1", "--nope"], { [envName("talent_pro_year")]: "price_BBBBBBBB2" });
  assert.equal(a.apply, true);
  assert.equal(a.backupFile, "b.json");
  assert.equal(a.prices.talent_pro_month, "price_AAAAAAAA1");
  assert.equal(a.prices.talent_pro_year, "price_BBBBBBBB2");
  assert.deepEqual(a.errors, ["unknown argument --nope"]);
  assert.equal(flagName("workspace_studio_month"), "--workspace-studio-month");
  assert.equal(parseArgs([], {}).apply, false, "dry run is the default");
});

test("planAction: insert, update and unchanged", () => {
  const w = { stripe_price_id: "price_X", unit_amount: 900 };
  assert.equal(planAction(undefined, w).action, "insert");
  assert.equal(planAction({ stripe_price_id: "price_OLD", unit_amount: 900 }, w).action, "update");
  assert.equal(planAction({ stripe_price_id: "price_X", unit_amount: "900" }, w).action, "unchanged");
});

test("the runner wires every guard before it touches Stripe or the database, and is dry-run by default", () => {
  const src = readFileSync(join(HERE, "..", "seed-product-prices-from-stripe-test.mjs"), "utf8");
  const at = (s) => src.indexOf(s);
  assert.ok(at("checkDbLogin(") < at("envMentioningProd(") && at("envMentioningProd(") < at("checkStripeKey(") && at("checkStripeKey(") < at("checkAccountResponse(") && at("checkAccountResponse(") < at("new pg.Client"));
  assert.match(src, /BEGIN READ ONLY/);
  assert.match(src, /args\.apply \? "BEGIN" : "BEGIN READ ONLY"/);
  assert.match(src, /--apply needs --backup-file/);
  assert.ok(!/console\.(log|error)\([^)]*(databaseUrl|key\b)/.test(src), "never prints the URL or key");
  assert.match(src, /delete from public\.product_prices where id = \$1 and notes = \$2/, "cleanup deletes only rows it created");
});

const idsEntries = (over = {}) => PLAN_ROWS.filter((r) => !r.optional).map((r, i) => ({
  id: `price_Test${String(i).padStart(10, "0")}`,
  lookup_key: `tulala_${r.plan}_${r.interval}_usd`,
  livemode: false,
  interval: r.interval,
  currency: "usd",
  ...over,
}));

test("ids file: a valid file maps every lookup key to its row and its catalog amount", () => {
  const out = parseIdsFile(JSON.stringify(idsEntries()));
  assert.deepEqual(out.errors, []);
  assert.deepEqual(validatePriceIds(out.prices), []);
  assert.equal(out.prices.talent_max_month, "price_Test0000000002");
  assert.equal(out.amounts.talent_pro_year, 9000);
  assert.equal(rowKeyForLookup("tulala_talent_portfolio_year_usd"), "talent_max_year");
  assert.deepEqual(parseIdsFile(JSON.stringify({ prices: idsEntries() })).errors, []);
});

test("ids file: one livemode:true entry rejects the file", () => {
  const list = idsEntries();
  list[3].livemode = true;
  const out = parseIdsFile(JSON.stringify(list));
  assert.match(out.errors.join(";"), /livemode is not false/);
});

test("ids file: missing or non-boolean livemode is rejected", () => {
  const list = idsEntries();
  delete list[0].livemode;
  assert.match(parseIdsFile(JSON.stringify(list)).errors.join(";"), /livemode is not false/);
  assert.match(parseIdsFile(JSON.stringify(idsEntries({ livemode: "false" }))).errors.join(";"), /livemode is not false/);
});

test("ids file: bad JSON, empty, unknown lookup key, wrong interval, duplicates and bad ids are rejected", () => {
  assert.match(parseIdsFile("{nope").errors[0], /not valid JSON/);
  assert.match(parseIdsFile("[]").errors[0], /no price entries/);
  const unknown = idsEntries(); unknown[0].lookup_key = "tulala_other_month_usd";
  assert.match(parseIdsFile(JSON.stringify(unknown)).errors.join(";"), /unknown lookup key/);
  const wrongInterval = idsEntries(); wrongInterval[0].interval = "year";
  assert.match(parseIdsFile(JSON.stringify(wrongInterval)).errors.join(";"), /interval/);
  const dup = [...idsEntries(), idsEntries()[0]];
  assert.match(parseIdsFile(JSON.stringify(dup)).errors.join(";"), /duplicate/);
  const badId = idsEntries(); badId[0].id = "prod_123456789";
  assert.match(parseIdsFile(JSON.stringify(badId)).errors.join(";"), /not a price id/);
});

test("ids file: --ids-file parses, and cannot be mixed with row flags", () => {
  assert.equal(parseArgs(["--ids-file", "x.json"], {}).idsFile, "x.json");
  assert.equal(parseArgs(["--ids-file=x.json"], {}).idsFile, "x.json");
  assert.match(parseArgs(["--ids-file", "x.json", "--talent-pro-month", "price_AAAAAAAA1"], {}).errors.join(";"), /cannot be combined/);
  // env price ids are ignored when an ids file is given
  assert.deepEqual(parseArgs(["--ids-file", "x.json"], { [envName("talent_pro_year")]: "price_BBBBBBBB2" }).prices, {});
});

test("static amounts equal the plan catalog", () => {
  const src = readFileSync(join(HERE, "..", "..", "src", "lib", "access", "plan-catalog.ts"), "utf8");
  const cents = (plan, field) => Number(new RegExp(`${plan}: \\{[\\s\\S]*?${field}: (\\d+)`).exec(src)?.[1]);
  const map = { talent_pro: "talent_pro", talent_max: "talent_portfolio", workspace_studio: "studio", workspace_agency: "agency" };
  for (const [rowPrefix, plan] of Object.entries(map)) {
    assert.equal(STATIC_AMOUNTS[`${rowPrefix}_month`], cents(plan, "monthlyPriceCents"), plan);
    assert.equal(STATIC_AMOUNTS[`${rowPrefix}_year`], cents(plan, "annualPriceCents"), plan);
  }
});

test("runner with --ids-file needs no Stripe key; a livemode:true file is refused before the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-"));
  const run = (entries) => {
    const f = join(dir, "ids.json");
    writeFileSync(f, JSON.stringify(entries));
    const env = { PATH: process.env.PATH, DATABASE_URL: `postgres://${STAGING_DB_USER}:pw@127.0.0.1:1/postgres` };
    return spawnSync(process.execPath, [join(HERE, "..", "seed-product-prices-from-stripe-test.mjs"), "--ids-file", f], { env, encoding: "utf8" });
  };
  const live = idsEntries(); live[0].livemode = true;
  const bad = run(live);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /livemode is not false/);
  const ok = run(idsEntries());
  assert.doesNotMatch(ok.stderr, /no Stripe key/);
  assert.doesNotMatch(ok.stderr, /\[stripe-test-seed\] REFUSED/, "passes every guard and only fails to reach the unreachable test database");
});

test("the creator has a database-free workflow mode that writes only the five artifact fields", () => {
  const src = readFileSync(join(HERE, "..", "seed-stripe-test-prices.mjs"), "utf8");
  assert.match(src, /--static-catalog/);
  assert.match(src, /\{ id: price\.id, lookup_key: lookupKey, livemode: price\.livemode, interval: price\.recurring\?\.interval, currency: price\.currency \}/);
});
