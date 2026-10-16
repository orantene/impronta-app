import { test } from "node:test";
import assert from "node:assert/strict";

import { getStripePublishableKeyFor, getStripeMxPublishableKey } from "./client";
import { eventModeMismatch } from "./key-mode";
import {
  isStripeForceTestMode,
  resolvedStripeEnv,
  stripeAllowLivePayouts,
  stripeEnv,
  stripeTestSiblingNames,
} from "./env-keys";

// Fake values only: shaped like Stripe keys so mode detection works.
const LIVE: Record<string, string> = {
  STRIPE_SECRET_KEY: "sk_live_fake",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_fake",
  STRIPE_MX_SECRET_KEY: "sk_live_fakemx",
  STRIPE_MX_PUBLISHABLE_KEY: "pk_live_fakemx",
  STRIPE_WEBHOOK_SECRET: "whsec_live",
  STRIPE_WEBHOOK_SECRET_CONNECT: "whsec_live_connect",
  STRIPE_MX_WEBHOOK_SECRET: "whsec_live_mx",
  STRIPE_MX_WEBHOOK_SECRET_CONNECT: "whsec_live_mx_connect",
  STRIPE_PRICE_NETWORK_MONTHLY: "price_live",
  STRIPE_ALLOW_LIVE_PAYOUTS: "true",
};
const TEST: Record<string, string> = {
  STRIPE_SECRET_KEY_TEST: "sk_test_fake",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST: "pk_test_fake",
  STRIPE_MX_SECRET_KEY_TEST: "sk_test_fakemx",
  STRIPE_MX_PUBLISHABLE_KEY_TEST: "pk_test_fakemx",
  STRIPE_WEBHOOK_SECRET_TEST: "whsec_test",
  STRIPE_WEBHOOK_SECRET_CONNECT_TEST: "whsec_test_connect",
  STRIPE_MX_WEBHOOK_SECRET_TEST: "whsec_test_mx",
  STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST: "whsec_test_mx_connect",
  STRIPE_PRICE_NETWORK_MONTHLY_TEST: "price_test",
};

function withEnv(vars: Record<string, string>, fn: () => void): void {
  const keys = new Set([...Object.keys(vars), "STRIPE_FORCE_TEST_MODE", ...Object.keys(LIVE), ...Object.keys(TEST)]);
  const saved = new Map<string, string | undefined>();
  for (const k of keys) saved.set(k, process.env[k]);
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, vars);
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("RED repro: flag on, the publishable key read returns the TEST key, never live", () => {
  withEnv({ ...LIVE, ...TEST, STRIPE_FORCE_TEST_MODE: "1" }, () => {
    assert.equal(getStripePublishableKeyFor("us"), "pk_test_fake");
    assert.equal(getStripeMxPublishableKey(), "pk_test_fakemx");
  });
});

test("flag on: every swapped name resolves to its _TEST sibling", () => {
  withEnv({ ...LIVE, ...TEST, STRIPE_FORCE_TEST_MODE: "1" }, () => {
    assert.equal(isStripeForceTestMode(), true);
    for (const name of Object.keys(LIVE).filter((n) => n !== "STRIPE_ALLOW_LIVE_PAYOUTS")) {
      assert.equal(stripeEnv(name), TEST[`${name}_TEST`], name);
    }
  });
});

test("flag off: live values pass through untouched", () => {
  withEnv({ ...LIVE, ...TEST }, () => {
    assert.equal(isStripeForceTestMode(), false);
    assert.equal(stripeEnv("STRIPE_SECRET_KEY"), "sk_live_fake");
    assert.equal(getStripePublishableKeyFor("us"), "pk_live_fake");
    assert.equal(stripeAllowLivePayouts(), true);
  });
});

test("fail closed: flag on and a TEST key missing returns undefined, never the live key", () => {
  withEnv({ ...LIVE, STRIPE_FORCE_TEST_MODE: "1" }, () => {
    assert.equal(stripeEnv("STRIPE_SECRET_KEY"), undefined);
    assert.equal(stripeEnv("STRIPE_WEBHOOK_SECRET"), undefined);
    assert.equal(getStripePublishableKeyFor("us"), null);
    assert.equal(getStripeMxPublishableKey(), null);
  });
});

test("fail closed: a live-shaped value in a _TEST slot is refused", () => {
  withEnv({ ...LIVE, STRIPE_SECRET_KEY_TEST: "sk_live_oops", STRIPE_FORCE_TEST_MODE: "1" }, () => {
    assert.equal(stripeEnv("STRIPE_SECRET_KEY"), undefined);
  });
});

test("flag on: live payouts are always disabled, whatever STRIPE_ALLOW_LIVE_PAYOUTS says", () => {
  withEnv({ ...LIVE, ...TEST, STRIPE_FORCE_TEST_MODE: "1" }, () => {
    assert.equal(stripeAllowLivePayouts(), false);
  });
});

test("webhook livemode guard follows the resolved key", () => {
  withEnv({ ...LIVE, ...TEST, STRIPE_FORCE_TEST_MODE: "1" }, () => {
    const key = stripeEnv("STRIPE_SECRET_KEY");
    assert.equal(eventModeMismatch(true, key), true, "live event ignored in forced test mode");
    assert.equal(eventModeMismatch(false, key), false, "test event processed");
  });
});

test("resolvedStripeEnv overlays every swapped name; sibling list is stable", () => {
  withEnv({ ...LIVE, ...TEST, STRIPE_FORCE_TEST_MODE: "1" }, () => {
    const env = resolvedStripeEnv();
    assert.equal(env.STRIPE_SECRET_KEY, "sk_test_fake");
    assert.equal(env.STRIPE_MX_WEBHOOK_SECRET, "whsec_test_mx");
    assert.equal(env.STRIPE_ALLOW_LIVE_PAYOUTS, undefined);
  });
  assert.ok(stripeTestSiblingNames().includes("STRIPE_SECRET_KEY_TEST"));
});
