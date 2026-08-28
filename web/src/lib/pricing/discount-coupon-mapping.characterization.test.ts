import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiscountCouponParams,
  buildDiscountPromotionCodeParams,
} from "./discount-stripe-params";

/**
 * discount-coupon-mapping.characterization.test.ts
 *
 * PART ONE pins the mapping EXACTLY as it behaved before the consolidation,
 * when it was inlined in `stripe-discount-sync.ts` with no test at all. The old
 * code did four things and this asserts all four, because a consolidation that
 * quietly changes what a live code charges is worse than no consolidation:
 *
 *   percent      → { percent_off: value, duration: "once" }
 *   fixed        → { amount_off: value*100, currency: lower, duration: "once" }
 *   free_months  → { percent_off: 100, duration: "repeating",
 *                    duration_in_months: value }
 *   window/cap   → max_redemptions + redeem_by (unix seconds) on the coupon,
 *                  max_redemptions + expires_at on the promotion code
 *
 * A legacy row is one written before the `duration` column existed, so it reads
 * back as `duration: "once"` with `durationMonths: null` — the inputs below.
 *
 * PART TWO covers what the consolidation ADDS: real durations, per-product
 * scope, and the promotion-code restrictions. Those are new capability; the
 * part-one assertions are the contract that must not move under them.
 */

// ─── Part one: today's behaviour, pinned ─────────────────────────────────────

test("legacy percent row maps to percent_off + duration once", () => {
  const got = buildDiscountCouponParams({
    name: "LATAM launch",
    kind: "percent",
    value: 50,
    currency: null,
    duration: "once",
    durationMonths: null,
  });
  assert.ok(got.ok);
  assert.deepEqual(got.params, {
    name: "LATAM launch",
    duration: "once",
    percent_off: 50,
  });
});

test("legacy fixed row maps to minor units + lowercase currency + duration once", () => {
  const got = buildDiscountCouponParams({
    name: "Ten off",
    kind: "fixed",
    value: 10,
    currency: "USD",
    duration: "once",
    durationMonths: null,
  });
  assert.ok(got.ok);
  assert.deepEqual(got.params, {
    name: "Ten off",
    duration: "once",
    amount_off: 1000,
    currency: "usd",
  });
});

test("a fixed discount with no currency is refused, not guessed", () => {
  const got = buildDiscountCouponParams({
    name: "Ten off",
    kind: "fixed",
    value: 10,
    currency: null,
    duration: "once",
    durationMonths: null,
  });
  assert.equal(got.ok, false);
});

test("free_months is percent 100 repeating N, even on a legacy duration:once row", () => {
  const got = buildDiscountCouponParams({
    name: "Two months free",
    kind: "free_months",
    value: 2,
    currency: null,
    // Exactly what a row written before the duration columns reads back as.
    duration: "once",
    durationMonths: null,
  });
  assert.ok(got.ok);
  assert.deepEqual(got.params, {
    name: "Two months free",
    percent_off: 100,
    duration: "repeating",
    duration_in_months: 2,
  });
});

test("the cap and the end date land on the coupon as they always did", () => {
  const got = buildDiscountCouponParams({
    name: "Capped",
    kind: "percent",
    value: 25,
    currency: null,
    duration: "once",
    durationMonths: null,
    maxRedemptions: 100,
    endsAt: "2027-01-01T00:00:00.000Z",
  });
  assert.ok(got.ok);
  assert.equal(got.params.max_redemptions, 100);
  assert.equal(got.params.redeem_by, Math.floor(Date.UTC(2027, 0, 1) / 1000));
});

test("the promotion code uppercases and links through `promotion`, not a flat coupon", () => {
  const got = buildDiscountPromotionCodeParams({
    code: " latam50 ",
    couponId: "co_123",
    maxRedemptions: 100,
    endsAt: "2027-01-01T00:00:00.000Z",
  });
  assert.ok(got.ok);
  assert.deepEqual(got.params, {
    promotion: { coupon: "co_123", type: "coupon" },
    code: "LATAM50",
    max_redemptions: 100,
    expires_at: Math.floor(Date.UTC(2027, 0, 1) / 1000),
  });
});

test("no restrictions object is sent when nothing restricts the code", () => {
  const got = buildDiscountPromotionCodeParams({
    code: "PLAIN",
    couponId: "co_1",
  });
  assert.ok(got.ok);
  assert.equal("restrictions" in got.params, false);
});

// ─── Part two: what the consolidation adds ───────────────────────────────────

test("a real duration now reaches Stripe instead of the hardcoded 'once'", () => {
  const got = buildDiscountCouponParams({
    name: "Three months of 30% off",
    kind: "percent",
    value: 30,
    currency: null,
    duration: "repeating",
    durationMonths: 3,
  });
  assert.ok(got.ok);
  assert.equal(got.params.duration, "repeating");
  assert.equal(got.params.duration_in_months, 3);
});

test("forever survives the mapping", () => {
  const got = buildDiscountCouponParams({
    name: "Lifer",
    kind: "percent",
    value: 20,
    currency: null,
    duration: "forever",
    durationMonths: null,
  });
  assert.ok(got.ok);
  assert.equal(got.params.duration, "forever");
  assert.equal("duration_in_months" in got.params, false);
});

test("a repeating discount with no month count is refused", () => {
  const got = buildDiscountCouponParams({
    name: "Broken",
    kind: "percent",
    value: 20,
    currency: null,
    duration: "repeating",
    durationMonths: null,
  });
  assert.equal(got.ok, false);
});

test("per-product scope becomes coupon.applies_to.products", () => {
  const got = buildDiscountCouponParams({
    name: "Studio only",
    kind: "percent",
    value: 50,
    currency: null,
    duration: "once",
    durationMonths: null,
    productIds: ["prod_studio", "prod_agency"],
  });
  assert.ok(got.ok);
  assert.deepEqual(got.params.applies_to, {
    products: ["prod_studio", "prod_agency"],
  });
});

test("an empty product list means unrestricted, not an empty restriction", () => {
  // An `applies_to: { products: [] }` would be a coupon valid on nothing.
  for (const productIds of [[], null, undefined]) {
    const got = buildDiscountCouponParams({
      name: "All plans",
      kind: "percent",
      value: 50,
      currency: null,
      duration: "once",
      durationMonths: null,
      productIds,
    });
    assert.ok(got.ok);
    assert.equal("applies_to" in got.params, false);
  }
});

test("first-time-only and minimum spend become promotion-code restrictions", () => {
  const got = buildDiscountPromotionCodeParams({
    code: "NEWONLY",
    couponId: "co_1",
    firstTimeOnly: true,
    minimumAmountCents: 5000,
    minimumAmountCurrency: "USD",
  });
  assert.ok(got.ok);
  assert.deepEqual(got.params.restrictions, {
    first_time_transaction: true,
    minimum_amount: 5000,
    minimum_amount_currency: "usd",
  });
});

test("a minimum spend with no currency is refused rather than dropped", () => {
  const got = buildDiscountPromotionCodeParams({
    code: "MINONLY",
    couponId: "co_1",
    minimumAmountCents: 5000,
    minimumAmountCurrency: null,
  });
  assert.equal(got.ok, false);
});

test("restricting a code to one customer is expressible", () => {
  const got = buildDiscountPromotionCodeParams({
    code: "ONEACCT",
    couponId: "co_1",
    customerId: "cus_123",
  });
  assert.ok(got.ok);
  assert.equal(got.params.customer, "cus_123");
});
