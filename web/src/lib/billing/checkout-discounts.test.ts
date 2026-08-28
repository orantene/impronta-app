import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckoutDiscountParams,
  OPEN_TO_PROMOTION_CODES,
  type CheckoutDiscountCandidates,
  type ResolvedCheckoutDiscount,
} from "./checkout-discounts";

/**
 * Two things are pinned here.
 *
 * 1. PRECEDENCE — the negotiated account discount beats a typed code, a typed
 *    code beats nothing. Get this backwards and an account we promised 30% to
 *    pays full price the moment they use a public code.
 * 2. THE EXCLUSIVITY INVARIANT — Stripe errors on a Session that sets both
 *    `discounts` and `allow_promotion_codes`. The types already forbid it; this
 *    asserts it at runtime for every branch, because a `never` marker is only
 *    as good as the last person who cast around it.
 */

function assertNeverBoth(resolved: ResolvedCheckoutDiscount) {
  const params = resolved.params as {
    discounts?: unknown;
    allow_promotion_codes?: unknown;
  };
  const hasDiscounts = params.discounts !== undefined;
  const hasFlag = params.allow_promotion_codes !== undefined;
  assert.ok(
    hasDiscounts !== hasFlag,
    `exactly one of discounts / allow_promotion_codes must be set, got ${JSON.stringify(params)}`,
  );
}

const ACCOUNT: CheckoutDiscountCandidates = {
  accountCouponId: "co_account30",
  accountDiscountId: "d1",
};
const PROMO_FULL: CheckoutDiscountCandidates = {
  promo: { code: "LAUNCH50", couponId: "co_launch", promotionCodeId: "promo_launch" },
};

test("an account discount wins and is passed as a coupon", () => {
  const got = buildCheckoutDiscountParams(ACCOUNT);
  assert.deepEqual(got.params, { discounts: [{ coupon: "co_account30" }] });
  assert.deepEqual(got.applied, {
    source: "account",
    discountId: "d1",
    couponId: "co_account30",
  });
  assertNeverBoth(got);
});

test("an account discount beats a perfectly valid promo code", () => {
  const got = buildCheckoutDiscountParams({ ...ACCOUNT, ...PROMO_FULL });
  assert.deepEqual(got.params, { discounts: [{ coupon: "co_account30" }] });
  assert.equal(got.applied?.source, "account");
  assertNeverBoth(got);
});

test("a validated code is passed as its promotion_code, so Stripe counts it", () => {
  const got = buildCheckoutDiscountParams(PROMO_FULL);
  assert.deepEqual(got.params, { discounts: [{ promotion_code: "promo_launch" }] });
  assert.equal(got.applied?.source, "code");
  assertNeverBoth(got);
});

test("a code with only a coupon still discounts", () => {
  const got = buildCheckoutDiscountParams({
    promo: { code: "LEGACY", couponId: "co_legacy", promotionCodeId: null },
  });
  assert.deepEqual(got.params, { discounts: [{ coupon: "co_legacy" }] });
  assertNeverBoth(got);
});

test("a stub code (no Stripe ids) falls through to the typed-code box", () => {
  // The DB row exists but Stripe never got it — it cannot discount anything,
  // and pretending otherwise would send Stripe a dangling reference.
  const got = buildCheckoutDiscountParams({
    promo: { code: "STUBONLY", couponId: null, promotionCodeId: null },
  });
  assert.deepEqual(got.params, { allow_promotion_codes: true });
  assert.equal(got.applied, null);
  assertNeverBoth(got);
});

test("nothing resolved → the buyer may type a code", () => {
  const got = buildCheckoutDiscountParams({});
  assert.deepEqual(got.params, { allow_promotion_codes: true });
  assert.equal(got.applied, null);
  assertNeverBoth(got);
});

test("blank / whitespace ids are treated as absent", () => {
  const got = buildCheckoutDiscountParams({
    accountCouponId: "   ",
    promo: { code: "X", couponId: "", promotionCodeId: "  " },
  });
  assert.deepEqual(got.params, { allow_promotion_codes: true });
  assertNeverBoth(got);
});

test("the exported open branch is itself legal", () => {
  assertNeverBoth(OPEN_TO_PROMOTION_CODES);
});

test("EVERY branch of the matrix satisfies the exclusivity invariant", () => {
  const matrix: CheckoutDiscountCandidates[] = [
    {},
    { accountCouponId: null },
    { accountCouponId: "co_a" },
    { promo: null },
    { promo: { code: "A", couponId: null, promotionCodeId: null } },
    { promo: { code: "A", couponId: "co_b", promotionCodeId: null } },
    { promo: { code: "A", couponId: null, promotionCodeId: "promo_b" } },
    { accountCouponId: "co_a", promo: { code: "A", couponId: "co_b", promotionCodeId: "promo_b" } },
  ];
  for (const candidates of matrix) {
    assertNeverBoth(buildCheckoutDiscountParams(candidates));
  }
});
