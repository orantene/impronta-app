import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import {
  ALL_PLAN_LOOKUP_KEYS,
  TEST_COUPON_IDS,
  checkKeyFileMode,
  checkLivemode,
  checkStripeKey,
  describeStripeApply,
  parseArgs,
  parseKeyFileText,
  planLookupKey,
  signGuestThreadToken,
} from "./group6-fixtures.mjs";

test("stripe key guard refuses live, restricted and unknown keys", () => {
  assert.equal(checkStripeKey("sk_test_abc").ok, true);
  for (const bad of ["sk_live_abc", "rk_live_abc", "rk_test_abc", "pk_test_abc", "whsec_x", "", undefined, null]) {
    assert.equal(checkStripeKey(bad).ok, false, String(bad));
  }
  assert.match(checkStripeKey("sk_live_abc").reason, /LIVE/);
  assert.equal(JSON.stringify(checkStripeKey("sk_live_SECRETVALUE")).includes("SECRETVALUE"), false);
});

test("key file must not be group or world readable", () => {
  assert.equal(checkKeyFileMode(0o100600).ok, true);
  assert.equal(checkKeyFileMode(0o400).ok, true);
  for (const m of [0o644, 0o640, 0o604, 0o660, 0o777]) assert.equal(checkKeyFileMode(m).ok, false, m.toString(8));
});

test("livemode proof needs balance.livemode === false", () => {
  assert.equal(checkLivemode({ balanceLivemode: false, accountLivemode: undefined }).ok, true);
  assert.equal(checkLivemode({ balanceLivemode: false, accountLivemode: false }).ok, true);
  assert.equal(checkLivemode({ balanceLivemode: true }).ok, false);
  assert.equal(checkLivemode({ balanceLivemode: undefined }).ok, false);
  assert.equal(checkLivemode({ balanceLivemode: false, accountLivemode: true }).ok, false);
});

test("key file parser accepts KEY=value or a bare key", () => {
  assert.equal(parseKeyFileText("STRIPE_SECRET_KEY=sk_test_abc123\n"), "sk_test_abc123");
  assert.equal(parseKeyFileText('STRIPE_SECRET_KEY="sk_test_abc123"'), "sk_test_abc123");
  assert.equal(parseKeyFileText("sk_test_abc123"), "sk_test_abc123");
  assert.equal(parseKeyFileText("two words here"), null);
});

test("preflight flags: --stripe is required, and it is read-only", () => {
  assert.ok(parseArgs(["--preflight"]).errors.length > 0);
  assert.equal(parseArgs(["--stripe", "--preflight"]).errors.length, 0);
  assert.ok(parseArgs(["--stripe", "--preflight", "--apply"]).errors.length > 0);
  assert.ok(parseArgs(["--stripe-key-file", "/x"]).errors.length > 0);
  assert.equal(parseArgs(["--stripe", "--stripe-key-file", "/x"]).stripeKeyFile, "/x");
});

test("lookup keys match seed-stripe-test-prices.mjs and the apply plan reports blockers", () => {
  assert.equal(planLookupKey("talent_portfolio", "month"), "tulala_talent_portfolio_month_usd");
  assert.equal(ALL_PLAN_LOOKUP_KEYS.length, 10);
  const none = Object.fromEntries(ALL_PLAN_LOOKUP_KEYS.map((k) => [k, null]));
  const blocked = describeStripeApply({ prices: none, coupons: {}, customers: {}, paymentIntents: { refundable: false } });
  assert.ok(blocked.some((l) => l.startsWith("BLOCKED")));
  const ready = describeStripeApply({
    prices: { ...none, tulala_talent_portfolio_month_usd: "price_1", tulala_talent_pro_month_usd: "price_2" },
    coupons: Object.fromEntries(TEST_COUPON_IDS.map((c) => [c, true])),
    customers: { limpieza: true },
    paymentIntents: { refundable: true },
  });
  assert.equal(ready.some((l) => l.startsWith("BLOCKED")), false);
  assert.ok(ready.some((l) => l.startsWith("reuse") && l.includes("limpieza")));
  assert.ok(ready.some((l) => l.includes("PaymentIntent") && l.startsWith("reuse")));
});

test("guest thread token has the shape the app verifies (v1.payload.HMAC over pos-thread:v1:payload)", () => {
  const token = signGuestThreadToken("secret-for-test", "inq-1", "tenant-1", 1_000_000, 5_000);
  const [v, encoded, sig] = token.split(".");
  assert.equal(v, "v1");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.deepEqual(payload, { p: "pos-thread", iq: "inq-1", tenant: "tenant-1", iat: 1_000_000, exp: 1_005_000 });
  assert.equal(sig, createHmac("sha256", "secret-for-test").update(`pos-thread:v1:${encoded}`).digest("base64url"));
});
