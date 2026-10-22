import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rentBillingGate } from "./rent-gate";
import { rentAutopayGate } from "./rent-autopay";

describe("rentBillingGate", () => {
  test("flag and test key both required", () => {
    assert.deepEqual(rentBillingGate({ RENT_BILLING_ENABLED: "1", STRIPE_SECRET_KEY: "sk_test_x" }), { ok: true });
    assert.deepEqual(rentBillingGate({ STRIPE_SECRET_KEY: "sk_test_x" }), { ok: false, reason: "disabled" });
    assert.deepEqual(rentBillingGate({ RENT_BILLING_ENABLED: "1", STRIPE_SECRET_KEY: "sk_live_x" }), { ok: false, reason: "not_test_mode" });
    assert.deepEqual(rentBillingGate({ RENT_BILLING_ENABLED: "1" }), { ok: false, reason: "not_test_mode" });
  });
  test("forced test mode: live raw key + _TEST sibling passes", () => {
    assert.deepEqual(
      rentBillingGate({ RENT_BILLING_ENABLED: "1", STRIPE_FORCE_TEST_MODE: "1", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_SECRET_KEY_TEST: "sk_test_y" }),
      { ok: true },
    );
  });
  test("forced test mode: no _TEST sibling fails, even with a test raw key", () => {
    assert.deepEqual(
      rentBillingGate({ RENT_BILLING_ENABLED: "1", STRIPE_FORCE_TEST_MODE: "1", STRIPE_SECRET_KEY: "sk_live_x" }),
      { ok: false, reason: "not_test_mode" },
    );
    assert.deepEqual(
      rentBillingGate({ RENT_BILLING_ENABLED: "1", STRIPE_FORCE_TEST_MODE: "1", STRIPE_SECRET_KEY: "sk_test_x" }),
      { ok: false, reason: "not_test_mode" },
    );
  });
  test("forced test mode: a live key parked in the _TEST slot never passes", () => {
    assert.deepEqual(
      rentBillingGate({ RENT_BILLING_ENABLED: "1", STRIPE_FORCE_TEST_MODE: "1", STRIPE_SECRET_KEY_TEST: "sk_live_z" }),
      { ok: false, reason: "not_test_mode" },
    );
  });
});

describe("rentAutopayGate under forced test mode", () => {
  const base = { RENT_AUTOPAY_ENABLED: "1", STRIPE_FORCE_TEST_MODE: "1" };
  test("live raw key + _TEST sibling passes (US and MX)", () => {
    assert.deepEqual(rentAutopayGate({ ...base, STRIPE_SECRET_KEY: "sk_live_x", STRIPE_SECRET_KEY_TEST: "sk_test_y" }, "us"), { ok: true });
    assert.deepEqual(rentAutopayGate({ ...base, STRIPE_MX_SECRET_KEY: "sk_live_x", STRIPE_MX_SECRET_KEY_TEST: "sk_test_y" }, "mx"), { ok: true });
  });
  test("no _TEST sibling fails, even with a test raw key", () => {
    assert.deepEqual(rentAutopayGate({ ...base, STRIPE_SECRET_KEY: "sk_test_x" }, "us"), { ok: false, reason: "not_test_mode" });
    assert.deepEqual(rentAutopayGate({ ...base, STRIPE_MX_SECRET_KEY: "sk_test_x" }, "mx"), { ok: false, reason: "not_test_mode" });
  });
  test("a US _TEST key never covers MX", () => {
    assert.deepEqual(rentAutopayGate({ ...base, STRIPE_SECRET_KEY_TEST: "sk_test_y", STRIPE_MX_SECRET_KEY: "sk_live_x" }, "mx"), { ok: false, reason: "not_test_mode" });
  });
  test("live key in the _TEST slot never passes", () => {
    assert.deepEqual(rentAutopayGate({ ...base, STRIPE_SECRET_KEY_TEST: "sk_live_z" }, "us"), { ok: false, reason: "not_test_mode" });
  });
});
