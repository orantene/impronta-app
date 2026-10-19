import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLIENT_PRO,
  MX_KEY_SECRET,
  PORTAL_VARS,
  TEST_SIBLING_COVERAGE,
  WORKFLOW_LANES,
  checkDistinctAccounts,
  clientProPriceParams,
  parseAmountCents,
  planClientProPrice,
  planPortal,
  selectSteps,
  toForm,
} from "./stripe-staging-config.mjs";
import { LOOKUP_KEYS, SEED_TAG, buildPortalConfiguration } from "./stripe-portal-config.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("lanes: the workflow choices, nothing else", () => {
  assert.deepEqual(WORKFLOW_LANES, ["us", "connect", "mx", "portal", "client-pro-price", "all"]);
  assert.equal(selectSteps("eu", { hasMxKey: true }).ok, false);
  assert.equal(selectSteps("", { hasMxKey: true }).ok, false);
});

test("each single lane selects only its own steps", () => {
  assert.deepEqual(selectSteps("us", { hasMxKey: false }).steps, ["webhook:us"]);
  assert.deepEqual(selectSteps("connect", { hasMxKey: false }).steps, ["webhook:us-connect"]);
  assert.deepEqual(selectSteps("mx", { hasMxKey: true }).steps, ["webhook:mx", "webhook:mx-connect"]);
  assert.deepEqual(selectSteps("portal", { hasMxKey: true }).steps, ["portal:us", "portal:mx"]);
  assert.deepEqual(selectSteps("client-pro-price", { hasMxKey: false }).steps, ["client-pro-price"]);
});

test("lane=mx without the MX key is a hard refusal (exit non-zero)", () => {
  const r = selectSteps("mx", { hasMxKey: false });
  assert.equal(r.ok, false);
  assert.match(r.reason, new RegExp(`${MX_KEY_SECRET} is not set`));
});

test("lane=all without the MX key skips ONLY the MX steps, cleanly, and runs the rest", () => {
  const r = selectSteps("all", { hasMxKey: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.steps, ["webhook:us", "webhook:us-connect", "portal:us", "client-pro-price"]);
  assert.deepEqual(
    r.skipped.map((s) => s.id),
    ["webhook:mx", "webhook:mx-connect", "portal:mx"],
  );
  for (const s of r.skipped) assert.equal(s.reason, `skipped: ${MX_KEY_SECRET} not set`);
});

test("lane=portal without the MX key skips the MX portal, non-fatal", () => {
  const r = selectSteps("portal", { hasMxKey: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.steps, ["portal:us"]);
  assert.deepEqual(r.skipped, [{ id: "portal:mx", reason: `skipped: ${MX_KEY_SECRET} not set` }]);
});

test("lane=all with the MX key runs everything, MX included", () => {
  const r = selectSteps("all", { hasMxKey: true });
  assert.deepEqual(r.steps, [
    "webhook:us",
    "webhook:us-connect",
    "webhook:mx",
    "webhook:mx-connect",
    "portal:us",
    "portal:mx",
    "client-pro-price",
  ]);
  assert.deepEqual(r.skipped, []);
});

test("the MX key must be a different Stripe account from the US key", () => {
  assert.equal(checkDistinctAccounts("acct_us", "acct_mx").ok, true);
  assert.equal(checkDistinctAccounts("acct_1", "acct_1").ok, false);
  assert.equal(checkDistinctAccounts(null, "acct_mx").ok, false);
  assert.equal(checkDistinctAccounts("acct_us", undefined).ok, false);
});

test("portal: reuse the tagged config, create when absent, never duplicate", () => {
  const products = [{ product: "prod_1", prices: ["price_1"] }];
  const tagged = { id: "bpc_1", active: true, metadata: { tulala_seed: SEED_TAG } };
  assert.deepEqual(planPortal({ configs: [tagged], products, explicit: true }), { action: "reuse", configId: "bpc_1" });
  assert.deepEqual(planPortal({ configs: [{ id: "bpc_d", active: true, metadata: {} }], products, explicit: true }), {
    action: "create",
  });
  // An inactive tagged config is ignored.
  assert.equal(planPortal({ configs: [{ ...tagged, active: false }], products, explicit: true }).action, "create");
  assert.equal(planPortal({ configs: [tagged, { ...tagged, id: "bpc_2" }], products, explicit: true }).action, "refuse");
});

test("portal: no plan prices is a refusal when asked for, a skip under lane=all", () => {
  assert.equal(planPortal({ configs: [], products: [], explicit: true }).action, "refuse");
  const s = planPortal({ configs: [], products: [], explicit: false });
  assert.equal(s.action, "skip");
  assert.match(s.reason, /lookup_key/);
  // Reuse never needs products.
  const tagged = { id: "bpc_1", active: true, metadata: { tulala_seed: SEED_TAG } };
  assert.equal(planPortal({ configs: [tagged], products: [], explicit: true }).action, "reuse");
});

test("portal vars: one per account, _TEST siblings of what portal-params.ts reads", () => {
  assert.deepEqual(PORTAL_VARS, {
    us: "STRIPE_PORTAL_CONFIGURATION_ID_TEST",
    mx: "STRIPE_MX_PORTAL_CONFIGURATION_ID_TEST",
  });
  const src = readFileSync(join(WEB, "src/lib/stripe/portal-params.ts"), "utf8");
  assert.ok(src.includes('us: "STRIPE_PORTAL_CONFIGURATION_ID"'));
  assert.ok(src.includes('mx: "STRIPE_MX_PORTAL_CONFIGURATION_ID"'));
});

test("portal body mirrors the production intent (seed-stripe-portal-config.mjs)", () => {
  const cfg = buildPortalConfiguration([{ product: "prod_1", prices: ["price_1"] }]);
  assert.equal(cfg.metadata.tulala_seed, SEED_TAG);
  assert.equal(cfg.features.subscription_cancel.mode, "at_period_end");
  assert.equal(cfg.features.subscription_update.enabled, true);
  assert.equal(cfg.features.invoice_history.enabled, true);
  assert.equal(cfg.features.payment_method_update.enabled, true);
  assert.equal(LOOKUP_KEYS.length, 10);
});

test("amount input: blank is absent; only a positive whole number of cents passes", () => {
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
  assert.deepEqual(planClientProPrice({ prices: [good], amountCents: null, explicit: true }), {
    action: "reuse",
    priceId: "price_1",
  });
  assert.equal(planClientProPrice({ prices: [good], amountCents: 4900, explicit: true }).action, "reuse");
  // An amount that disagrees with the existing price refuses (never silently re-prices).
  assert.equal(planClientProPrice({ prices: [good], amountCents: 5900, explicit: true }).action, "refuse");
  // A price with the key but the wrong shape refuses.
  assert.equal(
    planClientProPrice({ prices: [{ ...good, recurring: { interval: "year", interval_count: 1 } }], amountCents: null, explicit: true })
      .action,
    "refuse",
  );
  assert.equal(planClientProPrice({ prices: [{ ...good, currency: "mxn" }], amountCents: null, explicit: true }).action, "refuse");
  assert.deepEqual(planClientProPrice({ prices: [], amountCents: 4900, explicit: true }), { action: "create", amountCents: 4900 });
  assert.equal(planClientProPrice({ prices: [], amountCents: null, explicit: true }).action, "refuse");
  assert.equal(planClientProPrice({ prices: [], amountCents: null, explicit: false }).action, "skip");
  // Inactive prices are ignored.
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
    assert.ok(["workflow", "manual", "present", "not-covered"].includes(how.source), n);
  }
  // The publishable keys cannot be read from the Stripe API: manual dashboard items.
  assert.equal(TEST_SIBLING_COVERAGE.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST.source, "manual");
  assert.equal(TEST_SIBLING_COVERAGE.STRIPE_CLIENT_PRO_PRICE_ID_TEST.source, "workflow");
});
