import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLIENT_PRO,
  CLI_LANES,
  DEFAULT_ENV_FILE,
  FINGERPRINT_LEN,
  KEY_NAMES,
  PORTAL_VARS,
  PREVIEW_TARGET,
  PUBLISHABLE_NAMES,
  TEST_SIBLING_COVERAGE,
  checkAccountMatch,
  checkDistinctAccounts,
  clientProPriceParams,
  fingerprintLabel,
  keyFingerprint,
  parseAmountCents,
  parseArgs,
  planClientProPrice,
  planPortal,
  portalFeatureSummary,
  readNamedVars,
  replaceUnmarkedFor,
  selectSteps,
  toForm,
  vercelWriteBody,
} from "./stripe-staging-config.mjs";
import { LOOKUP_KEYS, SEED_TAG, buildPortalConfiguration } from "./stripe-portal-config.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");

// Fake keys: shape only. FP_US/FP_MX are 15-char account parts (acct_1 + 15).
const FP_US = "AbCdEfGhIjTmH6M";
const FP_MX = "ZyXwVuTsRqRZ8nV";
const SK_US = `sk_test_51${FP_US}restOfTheSecretKeyXYZ`;
const PK_US = `pk_test_51${FP_US}restOfThePublishableKey`;
const SK_MX = `sk_test_51${FP_MX}otherSecretMaterial`;
const PK_MX = `pk_test_51${FP_MX}otherPublishable`;

// ─── Key source ──────────────────────────────────────────────────────────────

test("env file parser returns ONLY the requested names, never the DB vars beside them", () => {
  const text = [
    "# local env",
    "NEXT_PUBLIC_SUPABASE_URL=https://pluhda.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=service-role-secret",
    "DATABASE_URL=postgres://prod",
    `STRIPE_SECRET_KEY=${SK_US}`,
    `export STRIPE_MX_SECRET_KEY="${SK_MX}"`,
    "STRIPE_SECRET_KEY_TEST=sk_test_ignored",
    "STRIPE_WEBHOOK_SECRET=whsec_ignored",
  ].join("\n");
  const got = readNamedVars(text, Object.values(KEY_NAMES));
  assert.deepEqual(Object.keys(got).sort(), ["STRIPE_MX_SECRET_KEY", "STRIPE_SECRET_KEY"]);
  assert.equal(got.STRIPE_SECRET_KEY, SK_US);
  assert.equal(got.STRIPE_MX_SECRET_KEY, SK_MX);
});

test("env file parser: quotes, comments, CRLF, last assignment wins, missing name absent", () => {
  const text = "STRIPE_SECRET_KEY=first\r\nSTRIPE_SECRET_KEY='sk_test_51x' \r\n#STRIPE_MX_SECRET_KEY=commented\nSTRIPE_MXX=no";
  assert.deepEqual(readNamedVars(text, ["STRIPE_SECRET_KEY", "STRIPE_MX_SECRET_KEY"]), { STRIPE_SECRET_KEY: "sk_test_51x" });
  assert.deepEqual(readNamedVars("STRIPE_SECRET_KEY=abc # note", ["STRIPE_SECRET_KEY"]), { STRIPE_SECRET_KEY: "abc" });
  assert.deepEqual(readNamedVars("", ["STRIPE_SECRET_KEY"]), {});
  assert.deepEqual(readNamedVars(undefined, ["STRIPE_SECRET_KEY"]), {});
});

test("key names and default file are fixed", () => {
  assert.deepEqual(KEY_NAMES, { us: "STRIPE_SECRET_KEY", mx: "STRIPE_MX_SECRET_KEY" });
  assert.deepEqual(PUBLISHABLE_NAMES, { us: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST", mx: "STRIPE_MX_PUBLISHABLE_KEY_TEST" });
  assert.equal(DEFAULT_ENV_FILE, "/Users/oranpersonal/Desktop/impronta-app/web/.env.local");
});

// ─── Fingerprint ─────────────────────────────────────────────────────────────

test("fingerprint = the 15 account-id characters after _test_51, same in sk/rk/pk", () => {
  assert.equal(FINGERPRINT_LEN, 15);
  assert.equal(keyFingerprint(SK_US), FP_US);
  assert.equal(keyFingerprint(PK_US), FP_US);
  assert.equal(keyFingerprint(`rk_test_51${FP_US}zzz`), FP_US);
  for (const bad of ["sk_live_51AbCdEfGhIjTmH6Mxyz", "pk_live_51AbCdEfGhIjTmH6Mxyz", "sk_test_50AbCdEfGhIjTmH6Mxyz", "sk_test_51short", "", undefined, null]) {
    assert.equal(keyFingerprint(bad), null, String(bad));
  }
  assert.equal(fingerprintLabel(FP_US), "...jTmH6M");
  assert.equal(fingerprintLabel(null), "(none)");
});

test("account match: key, Preview publishable key and /v1/account must agree", () => {
  const ok = checkAccountMatch({ label: "US", secretKey: SK_US, publishableKey: PK_US, accountId: `acct_1${FP_US}` });
  assert.deepEqual(ok, { ok: true, fingerprint: FP_US });
  // Publishable key from another account.
  const crossed = checkAccountMatch({ label: "US", secretKey: SK_US, publishableKey: PK_MX, accountId: `acct_1${FP_US}` });
  assert.equal(crossed.ok, false);
  assert.match(crossed.reason, /!= Preview publishable key account/);
  // The reason never contains key material beyond the 6-char label.
  assert.ok(!crossed.reason.includes(SK_US) && !crossed.reason.includes(FP_US));
  // /v1/account says another account.
  assert.equal(checkAccountMatch({ label: "US", secretKey: SK_US, publishableKey: PK_US, accountId: `acct_1${FP_MX}` }).ok, false);
  assert.equal(checkAccountMatch({ label: "US", secretKey: SK_US, publishableKey: PK_US, accountId: null }).ok, false);
  // Missing / live publishable key.
  assert.equal(checkAccountMatch({ label: "MX", secretKey: SK_MX, publishableKey: undefined, accountId: `acct_1${FP_MX}` }).ok, false);
  assert.equal(checkAccountMatch({ label: "MX", secretKey: SK_MX, publishableKey: `pk_live_51${FP_MX}x`, accountId: `acct_1${FP_MX}` }).ok, false);
  // Live secret key never matches.
  assert.equal(checkAccountMatch({ label: "US", secretKey: `sk_live_51${FP_US}x`, publishableKey: PK_US, accountId: `acct_1${FP_US}` }).ok, false);
  assert.equal(checkAccountMatch({ label: "MX", secretKey: SK_MX, publishableKey: PK_MX, accountId: `acct_1${FP_MX}` }).ok, true);
});

test("the MX key must be a different Stripe account from the US key", () => {
  assert.equal(checkDistinctAccounts("acct_us", "acct_mx").ok, true);
  assert.equal(checkDistinctAccounts("acct_1", "acct_1").ok, false);
  assert.equal(checkDistinctAccounts(null, "acct_mx").ok, false);
});

// ─── Vercel writes ───────────────────────────────────────────────────────────

test("every Vercel write is sensitive and targets exactly [preview]", () => {
  assert.deepEqual([...PREVIEW_TARGET], ["preview"]);
  const body = vercelWriteBody("v");
  assert.deepEqual(body.target, ["preview"]);
  assert.equal(body.type, "sensitive");
  assert.ok(!body.target.includes("production") && !body.target.includes("development"));
  assert.deepEqual(Object.keys(body).sort(), ["target", "type", "value"]);
  // A fresh array each time: a caller mutating one write cannot widen the next.
  body.target.push("production");
  assert.deepEqual(vercelWriteBody("w").target, ["preview"]);
});

// ─── CLI ─────────────────────────────────────────────────────────────────────

test("args: dry run by default; only --apply writes", () => {
  const d = parseArgs(["--lane", "all"]);
  assert.equal(d.ok, true);
  assert.equal(d.apply, false);
  assert.equal(d.recreate, false);
  assert.equal(d.envFile, DEFAULT_ENV_FILE);
  assert.equal(d.replaceUnmarkedMxPlatform, false);
  assert.equal(parseArgs(["--lane", "all", "--replace-unmarked-mx-platform"]).replaceUnmarkedMxPlatform, true);
  const a = parseArgs(["--lane", "portal", "--apply", "--recreate", "--client-pro-amount-cents", "4900", "--keys-file", "/tmp/x.env"]);
  assert.deepEqual([a.lane, a.apply, a.recreate, a.clientProAmountCents, a.envFile], ["portal", true, true, "4900", "/tmp/x.env"]);
  // Not --env-file: Node 20 itself consumes --env-file even after the script
  // name and would load the WHOLE file (production DB vars too) into process.env.
  assert.equal(parseArgs(["--lane", "us", "--env-file", "/tmp/x.env"]).ok, false);
  assert.equal(parseArgs([]).ok, false);
  assert.equal(parseArgs(["--lane", "eu"]).ok, false);
  assert.equal(parseArgs(["--lane"]).ok, false);
  assert.equal(parseArgs(["--lane", "us", "--yes"]).ok, false);
  assert.equal(parseArgs(["--lane", "us", "--client-pro-amount-cents", "--apply"]).ok, false);
  assert.deepEqual(CLI_LANES, ["us", "connect", "mx", "portal", "client-pro-price", "all"]);
});

test("each single lane selects only its own steps", () => {
  assert.deepEqual(selectSteps("us", { hasMxKey: true }).steps, ["webhook:us"]);
  assert.deepEqual(selectSteps("connect", { hasMxKey: true }).steps, ["webhook:us-connect"]);
  assert.deepEqual(selectSteps("mx", { hasMxKey: true }).steps, ["webhook:mx", "webhook:mx-connect"]);
  assert.deepEqual(selectSteps("portal", { hasMxKey: true }).steps, ["portal:us", "portal:mx"]);
  assert.deepEqual(selectSteps("client-pro-price", { hasMxKey: true }).steps, ["client-pro-price"]);
  assert.equal(selectSteps("eu", { hasMxKey: true }).ok, false);
});

test("lane all runs every step, MX included, but NOT client-pro-price (explicit lane only)", () => {
  const r = selectSteps("all", { hasMxKey: true });
  assert.deepEqual(r.steps, ["webhook:us", "webhook:us-connect", "webhook:mx", "webhook:mx-connect", "portal:us", "portal:mx"]);
  assert.ok(!r.steps.includes("client-pro-price"));
  assert.deepEqual(r.skipped, []);
});

test("the replace-unmarked flag applies to the MX platform lane only", () => {
  assert.equal(replaceUnmarkedFor("webhook:mx", true), true);
  assert.equal(replaceUnmarkedFor("webhook:mx", false), false);
  for (const id of ["webhook:us", "webhook:us-connect", "webhook:mx-connect"]) assert.equal(replaceUnmarkedFor(id, true), false, id);
});

test("MX key missing: lane mx refuses; lane all / portal skip only the MX steps", () => {
  const mx = selectSteps("mx", { hasMxKey: false });
  assert.equal(mx.ok, false);
  assert.match(mx.reason, /STRIPE_MX_SECRET_KEY is not in the env file/);
  const all = selectSteps("all", { hasMxKey: false });
  assert.equal(all.ok, true);
  assert.deepEqual(all.steps, ["webhook:us", "webhook:us-connect", "portal:us"]);
  assert.deepEqual(all.skipped.map((s) => s.id), ["webhook:mx", "webhook:mx-connect", "portal:mx"]);
  for (const s of all.skipped) assert.equal(s.reason, "skipped: STRIPE_MX_SECRET_KEY not in the env file");
  assert.deepEqual(selectSteps("portal", { hasMxKey: false }).steps, ["portal:us"]);
});

// ─── Portal ──────────────────────────────────────────────────────────────────

test("portal: reuse the tagged config, create when absent, never duplicate", () => {
  const products = [{ product: "prod_1", prices: ["price_1"] }];
  const tagged = { id: "bpc_1", active: true, metadata: { tulala_seed: SEED_TAG } };
  assert.deepEqual(planPortal({ configs: [tagged], products, explicit: true }), { action: "reuse", configId: "bpc_1" });
  assert.deepEqual(planPortal({ configs: [{ id: "bpc_d", active: true, metadata: {} }], products, explicit: true }), { action: "create" });
  assert.equal(planPortal({ configs: [{ ...tagged, active: false }], products, explicit: true }).action, "create");
  assert.equal(planPortal({ configs: [tagged, { ...tagged, id: "bpc_2" }], products, explicit: true }).action, "refuse");
});

test("portal: no plan prices is a refusal when asked for, a skip under lane all", () => {
  assert.equal(planPortal({ configs: [], products: [], explicit: true }).action, "refuse");
  const s = planPortal({ configs: [], products: [], explicit: false });
  assert.equal(s.action, "skip");
  assert.match(s.reason, /lookup_key/);
  const tagged = { id: "bpc_1", active: true, metadata: { tulala_seed: SEED_TAG } };
  assert.equal(planPortal({ configs: [tagged], products: [], explicit: true }).action, "reuse");
});

test("portal vars: one per account, _TEST siblings of what portal-params.ts reads", () => {
  assert.deepEqual(PORTAL_VARS, { us: "STRIPE_PORTAL_CONFIGURATION_ID_TEST", mx: "STRIPE_MX_PORTAL_CONFIGURATION_ID_TEST" });
  const src = readFileSync(join(WEB, "src/lib/stripe/portal-params.ts"), "utf8");
  assert.ok(src.includes('us: "STRIPE_PORTAL_CONFIGURATION_ID"'));
  assert.ok(src.includes('mx: "STRIPE_MX_PORTAL_CONFIGURATION_ID"'));
});

test("portal body mirrors the production intent and summarises in one line", () => {
  const cfg = buildPortalConfiguration([{ product: "prod_1", prices: ["price_1"] }]);
  assert.equal(cfg.metadata.tulala_seed, SEED_TAG);
  assert.equal(LOOKUP_KEYS.length, 10);
  assert.equal(
    portalFeatureSummary(cfg),
    "invoice history on, payment method update on, cancel on (at_period_end), plan switching on (create_prorations, 1 products), pause off, customer update off",
  );
});

// ─── Client Pro price ────────────────────────────────────────────────────────

test("amount: blank is absent; only a positive whole number of cents passes", () => {
  assert.deepEqual(parseAmountCents(""), { ok: true, cents: null });
  assert.deepEqual(parseAmountCents(undefined), { ok: true, cents: null });
  assert.deepEqual(parseAmountCents(" 4900 "), { ok: true, cents: 4900 });
  for (const bad of ["49.00", "-1", "0", "abc", "1e3", "100000001"]) assert.equal(parseAmountCents(bad).ok, false, bad);
});

test("client pro price: reuse by lookup_key; create only with an amount", () => {
  const good = {
    id: "price_1",
    active: true,
    lookup_key: CLIENT_PRO.lookupKey,
    currency: "usd",
    unit_amount: 4900,
    recurring: { interval: "month", interval_count: 1 },
  };
  assert.deepEqual(planClientProPrice({ prices: [good], amountCents: null, explicit: true }), { action: "reuse", priceId: "price_1", amountCents: 4900 });
  assert.equal(planClientProPrice({ prices: [good], amountCents: 4900, explicit: true }).action, "reuse");
  assert.equal(planClientProPrice({ prices: [good], amountCents: 5900, explicit: true }).action, "refuse");
  assert.equal(
    planClientProPrice({ prices: [{ ...good, recurring: { interval: "year", interval_count: 1 } }], amountCents: null, explicit: true }).action,
    "refuse",
  );
  assert.equal(planClientProPrice({ prices: [{ ...good, currency: "mxn" }], amountCents: null, explicit: true }).action, "refuse");
  assert.deepEqual(planClientProPrice({ prices: [], amountCents: 4900, explicit: true }), { action: "create", amountCents: 4900 });
  assert.equal(planClientProPrice({ prices: [], amountCents: null, explicit: true }).action, "refuse");
  const skip = planClientProPrice({ prices: [], amountCents: null, explicit: false });
  assert.equal(skip.action, "skip");
  assert.match(skip.reason, /needs --client-pro-amount-cents/);
  assert.equal(planClientProPrice({ prices: [{ ...good, active: false }], amountCents: 4900, explicit: true }).action, "create");
});

test("client pro price params: monthly USD recurring, lookup_key, marked as ours", () => {
  const p = clientProPriceParams(4900);
  assert.equal(p.currency, "usd");
  assert.equal(p.unit_amount, 4900);
  assert.deepEqual(p.recurring, { interval: "month" });
  assert.equal(p.lookup_key, CLIENT_PRO.lookupKey);
  assert.equal(p.product_data.name, "Tulala Client Pro");
  assert.equal(p.metadata.managed_by, "tulala-staging-webhook-workflow");
  assert.equal(CLIENT_PRO.varName, "STRIPE_CLIENT_PRO_PRICE_ID_TEST");
  const src = readFileSync(join(WEB, "src/lib/stripe/client-billing.ts"), "utf8");
  assert.ok(src.includes('stripeEnv("STRIPE_CLIENT_PRO_PRICE_ID")'));
});

test("toForm flattens nested objects and arrays into Stripe bracket notation", () => {
  const f = toForm({
    a: "x",
    n: 5,
    b: true,
    o: { p: { q: "y" } },
    arr: ["one", "two"],
    objs: [{ product: "prod_1", prices: ["price_1", "price_2"] }],
    skip: undefined,
  });
  assert.deepEqual([...f.entries()], [
    ["a", "x"],
    ["n", "5"],
    ["b", "true"],
    ["o[p][q]", "y"],
    ["arr[0]", "one"],
    ["arr[1]", "two"],
    ["objs[0][product]", "prod_1"],
    ["objs[0][prices][0]", "price_1"],
    ["objs[0][prices][1]", "price_2"],
  ]);
});

test("every mode-bound Stripe name in env-keys.ts has a stated staging source", () => {
  const src = readFileSync(join(WEB, "src/lib/stripe/env-keys.ts"), "utf8");
  const block = src.match(/const MODE_BOUND = \[([\s\S]*?)\] as const;/);
  assert.ok(block, "MODE_BOUND not found");
  const names = [...block[1].matchAll(/"([A-Z0-9_]+)"/g)].map((m) => `${m[1]}_TEST`);
  assert.ok(names.length >= 16);
  assert.deepEqual(Object.keys(TEST_SIBLING_COVERAGE).sort(), [...names].sort());
  for (const [n, how] of Object.entries(TEST_SIBLING_COVERAGE)) {
    assert.ok(["script", "present", "fallback", "not-covered"].includes(how.source), n);
  }
  assert.equal(TEST_SIBLING_COVERAGE.STRIPE_CLIENT_PRO_PRICE_ID_TEST.source, "script");
  // Not needed: getStripeMxPublishableKey() falls back to STRIPE_MX_PUBLISHABLE_KEY (client.ts).
  assert.equal(TEST_SIBLING_COVERAGE.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY_TEST.source, "fallback");
  const client = readFileSync(join(WEB, "src/lib/stripe/client.ts"), "utf8");
  assert.match(client, /stripeEnv\("NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY"\) \|\|\s*stripeEnv\("STRIPE_MX_PUBLISHABLE_KEY"\)/);
});

// ─── The script itself (static) ──────────────────────────────────────────────

test("provision script: no DB client, no whole-file env load, only the two key names", () => {
  const src = readFileSync(join(WEB, "scripts/stripe/provision-staging-test.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const banned of ["supabase", "@supabase", "postgres", "dotenv", "--env-file", "loadEnvFile", "process.loadEnvFile", "DATABASE_URL"]) {
    assert.ok(!code.toLowerCase().includes(banned.toLowerCase()), `script must not reference ${banned}`);
  }
  // Never reads its own process env for secrets: no process.env access at all.
  assert.ok(!/process\.env/.test(code), "script must not read process.env");
  // The env file is read through readNamedVars with exactly KEY_NAMES.
  assert.equal([...code.matchAll(/readNamedVars\(/g)].length, 1, "exactly one env-file read");
  assert.ok(code.includes("readNamedVars(fileText, Object.values(KEY_NAMES))"));
  assert.equal([...code.matchAll(/readFileSync\(/g)].length, 1, "the keys file is the only file read");
  // Every Vercel write goes through vercelWriteBody (sensitive, ["preview"]).
  assert.ok(code.includes("vercelWriteBody("));
  assert.ok(!/target:\s*\[/.test(code), "no hand-written Vercel target in the script");
  // Values to Vercel go over stdin, never argv.
  assert.ok(code.includes('"--input", "-"'));
});
