import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPlatformCheckoutReady,
  resolveOnlineCollectReady,
} from "./online-collect-ready";

test("isPlatformCheckoutReady true when STRIPE_SECRET_KEY set", () => {
  assert.equal(isPlatformCheckoutReady({ STRIPE_SECRET_KEY: "sk_test_x" }), true);
  assert.equal(isPlatformCheckoutReady({ STRIPE_SECRET_KEY: "  sk_live_x  " }), true);
});

test("isPlatformCheckoutReady false when key missing or blank", () => {
  assert.equal(isPlatformCheckoutReady({}), false);
  assert.equal(isPlatformCheckoutReady({ STRIPE_SECRET_KEY: null }), false);
  assert.equal(isPlatformCheckoutReady({ STRIPE_SECRET_KEY: "" }), false);
  assert.equal(isPlatformCheckoutReady({ STRIPE_SECRET_KEY: "   " }), false);
});

test("resolveOnlineCollectReady Option B ignores Connect — platform only", () => {
  assert.equal(resolveOnlineCollectReady({ platformCheckoutReady: true }), true);
  assert.equal(resolveOnlineCollectReady({ platformCheckoutReady: false }), false);
});
