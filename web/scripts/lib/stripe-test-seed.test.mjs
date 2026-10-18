import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAN_ROWS, STAGING_DB_USER, checkAccountResponse, checkDbLogin, checkStripeKey, checkStripePrice,
  envMentioningProd, envName, flagName, parseArgs, planAction, validatePriceIds,
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
