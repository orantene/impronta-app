/** TUL-1610: a rent subscription lives on the studio's own Stripe platform (US or MX), end to end. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const actions = read("src/lib/service-hub/rent/rent-autopay-actions.ts");
const server = read("src/lib/service-hub/rent/rent-autopay.server.ts");
const handler = read("src/lib/stripe/webhook-handler.ts");
const sql = read("../supabase/migrations/_pending_pm/20261231423030_studio_rent_autopay_platform_tul1610.sql");

test("no rent autopay code is pinned to the US platform any more", () => {
  for (const src of [actions, server]) assert.doesNotMatch(src, /getStripeFor\("us"\)/);
  assert.doesNotMatch(actions, /mx_not_supported/);
});

test("start uses the studio's platform, fails closed when it cannot be read, and records it on the plan", () => {
  assert.match(actions, /loadAccountPlatformStrict\("agencies"/);
  assert.match(actions, /if \(!platform\) return \{ ok: false, reason: "unavailable" \}/);
  assert.match(actions, /getStripeFor\(platform\)/);
  assert.match(actions, /autopay_platform: platform, autopay_customer_id: customer\.data/);
});

test("an MX member customer is reused across her plans and created at most once (idempotency key)", () => {
  assert.match(actions, /\.eq\("autopay_platform", "mx"\)/);
  assert.match(actions, /idempotencyKey: `rent_mx_customer_\$\{p\.talentProfileId\}`/);
});

test("cancel, pause/resume and the webhook all act on the subscription's own platform", () => {
  assert.match(server, /cancelRentSubscription\(id, account\)/);
  assert.match(server, /getStripeFor\(platform\)/);
  assert.match(handler, /handleRentSubscriptionEvent\(sb, rent, account\)/);
});

test("the held migration carries the platform and customer columns", () => {
  assert.match(sql, /autopay_platform text NULL CHECK \(autopay_platform IS NULL OR autopay_platform IN \('us','mx'\)\)/);
  assert.match(sql, /autopay_customer_id text NULL/);
});

import { rentAutopayGate } from "./rent-autopay";

test("TUL-1610 gate: the TEST check reads the key of the platform actually chosen", () => {
  const on = { RENT_AUTOPAY_ENABLED: "1" };
  assert.deepEqual(rentAutopayGate({ ...on, STRIPE_SECRET_KEY: "sk_test_us", STRIPE_MX_SECRET_KEY: "sk_live_mx" }, "mx"), { ok: false, reason: "not_test_mode" }, "a live MX key never rides on a US test key");
  assert.deepEqual(rentAutopayGate({ ...on, STRIPE_SECRET_KEY: "sk_live_us", STRIPE_MX_SECRET_KEY: "sk_test_mx" }, "us"), { ok: false, reason: "not_test_mode" });
  assert.deepEqual(rentAutopayGate({ ...on, STRIPE_SECRET_KEY: "sk_test_us", STRIPE_MX_SECRET_KEY: "sk_test_mx" }, "mx"), { ok: true });
  assert.deepEqual(rentAutopayGate({ ...on, STRIPE_SECRET_KEY: "sk_test_us" }, "mx"), { ok: false, reason: "not_test_mode" }, "no MX key at all");
  assert.deepEqual(rentAutopayGate({ ...on, STRIPE_SECRET_KEY: "sk_test_us", STRIPE_MX_SECRET_KEY: "sk_live_mx" }), { ok: true }, "the US default is unchanged");
  assert.deepEqual(rentAutopayGate({ STRIPE_SECRET_KEY: "sk_test_us", STRIPE_MX_SECRET_KEY: "sk_test_mx" }, "mx"), { ok: false, reason: "disabled" });
});

test("TUL-1610 gate: start checks the platform's key after reading the platform, before any Stripe call", () => {
  const src = actions.replace(/\/\/.*$/gm, "");
  assert.ok(src.indexOf("rentAutopayGate(process.env, platform)") > src.indexOf("loadAccountPlatformStrict("));
  assert.ok(src.indexOf("rentAutopayGate(process.env, platform)") < src.indexOf("getStripeFor(platform)"));
  assert.match(src, /if \(!rentAutopayFlagOn\(\)\) return \{ ok: false, reason: "disabled" \}/);
});
