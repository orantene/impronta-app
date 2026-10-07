import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { stripeKeyMode, checkStripeKeyModes, eventModeMismatch } from "./key-mode";

describe("stripeKeyMode", () => {
  test("reads prefixes", () => {
    assert.equal(stripeKeyMode("sk_test_x"), "test");
    assert.equal(stripeKeyMode("pk_live_x"), "live");
    assert.equal(stripeKeyMode("rk_test_x"), "test");
    assert.equal(stripeKeyMode("nope"), null);
    assert.equal(stripeKeyMode(undefined), null);
  });
});

describe("checkStripeKeyModes", () => {
  test("all test is ok", () => {
    const r = checkStripeKeyModes({
      STRIPE_SECRET_KEY: "sk_test_a",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_a",
    });
    assert.deepEqual(r, { ok: true, mode: "test", mismatches: [] });
  });
  test("mixed is a mismatch, names only", () => {
    const r = checkStripeKeyModes({ STRIPE_SECRET_KEY: "sk_live_a", STRIPE_MX_SECRET_KEY: "sk_test_b" });
    assert.equal(r.ok, false);
    assert.deepEqual(r.mismatches, [
      { name: "STRIPE_SECRET_KEY", mode: "live" },
      { name: "STRIPE_MX_SECRET_KEY", mode: "test" },
    ]);
    assert.ok(!JSON.stringify(r).includes("sk_"));
  });
  test("unset keys are ignored", () => {
    const r = checkStripeKeyModes({ STRIPE_SECRET_KEY: "sk_live_a", STRIPE_MX_SECRET_KEY: "" });
    assert.equal(r.ok, true);
    assert.equal(r.mode, "live");
    assert.equal(checkStripeKeyModes({}).mode, null);
  });
});

describe("eventModeMismatch", () => {
  test("detects livemode vs key mode", () => {
    assert.equal(eventModeMismatch(true, "sk_test_a"), true);
    assert.equal(eventModeMismatch(false, "sk_live_a"), true);
    assert.equal(eventModeMismatch(true, "sk_live_a"), false);
    assert.equal(eventModeMismatch(false, "sk_test_a"), false);
  });
  test("unknown key or livemode never mismatches", () => {
    assert.equal(eventModeMismatch(true, undefined), false);
    assert.equal(eventModeMismatch(undefined, "sk_live_a"), false);
  });
});
