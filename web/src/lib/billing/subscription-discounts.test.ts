import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAccountCouponParams,
  extractSubscriptionDiscount,
  isUnexpandedDiscount,
  UNEXPANDED_DISCOUNT,
  type AccountCouponInput,
} from "./subscription-discounts";

/**
 * The coupon mapping is the code that decides what an account is actually
 * billed. It is pure, so it is pinned here rather than discovered on an
 * invoice. The extractor is the other half: it decides what our tables believe
 * about a live subscription, and its `null` vs "unexpanded" distinction is the
 * difference between propagating a removal and silently erasing a discount.
 */

const base: AccountCouponInput = {
  id: "11111111-1111-1111-1111-111111111111",
  subjectType: "workspace",
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  talentProfileId: null,
  kind: "percent",
  value: 30,
  currency: null,
  duration: "forever",
  durationMonths: null,
  subjectLabel: "Impronta",
};

test("percent discounts map to percent_off with the row's duration", () => {
  const params = buildAccountCouponParams(base);
  assert.equal(params.percent_off, 30);
  assert.equal(params.duration, "forever");
  assert.equal(params.amount_off, undefined);
  assert.equal(params.currency, undefined);
  assert.equal(params.duration_in_months, undefined);
});

test("repeating carries duration_in_months", () => {
  const params = buildAccountCouponParams({
    ...base,
    duration: "repeating",
    durationMonths: 2,
  });
  assert.equal(params.duration, "repeating");
  assert.equal(params.duration_in_months, 2);
});

test("'two months free' is percent 100 repeating 2 — not a separate kind", () => {
  const params = buildAccountCouponParams({
    ...base,
    value: 100,
    duration: "repeating",
    durationMonths: 2,
  });
  assert.equal(params.percent_off, 100);
  assert.equal(params.duration_in_months, 2);
});

test("fixed discounts convert MAJOR units to cents and lowercase the currency", () => {
  const params = buildAccountCouponParams({
    ...base,
    kind: "fixed",
    value: 12.5,
    currency: "USD",
  });
  assert.equal(params.amount_off, 1250);
  assert.equal(params.currency, "usd");
  assert.equal(params.percent_off, undefined);
});

test("fixed without a currency is refused, not silently billed", () => {
  assert.throws(
    () => buildAccountCouponParams({ ...base, kind: "fixed", currency: null }),
    /currency/i,
  );
});

test("the coupon is named and tagged so HQ can find it in Stripe", () => {
  const params = buildAccountCouponParams(base);
  assert.equal(params.name, "Account discount · Impronta");
  assert.deepEqual(params.metadata, {
    subscription_discount_id: base.id,
    subject_type: "workspace",
    tenant_id: base.tenantId,
  });
});

test("a talent grant tags talent_profile_id instead of tenant_id", () => {
  const params = buildAccountCouponParams({
    ...base,
    subjectType: "talent",
    tenantId: null,
    talentProfileId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    subjectLabel: null,
  });
  assert.deepEqual(params.metadata, {
    subscription_discount_id: base.id,
    subject_type: "talent",
    talent_profile_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  });
  // No label → the subject id keeps the coupon identifiable.
  assert.equal(params.name, "Account discount · bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
});

// ─── extractSubscriptionDiscount ─────────────────────────────────────────────

test("no discount reads as null, so the mirror columns get nulled out", () => {
  assert.equal(extractSubscriptionDiscount({ discounts: [] }), null);
  assert.equal(extractSubscriptionDiscount({ discounts: null }), null);
  assert.equal(extractSubscriptionDiscount({}), null);
});

test("a bare di_… id returns the unexpanded sentinel, NOT null", () => {
  const got = extractSubscriptionDiscount({ discounts: ["di_1Abc"] });
  assert.equal(got, UNEXPANDED_DISCOUNT);
  assert.ok(isUnexpandedDiscount(got));
  // The distinction is the whole point: null means "remove the discount".
  assert.notEqual(got, null);
});

test("an expanded discount yields the four mirror values", () => {
  const got = extractSubscriptionDiscount({
    discounts: [
      {
        end: 1893456000,
        source: {
          coupon: {
            id: "co_live_30",
            percent_off: 30,
            amount_off: null,
            currency: null,
          },
        },
      },
    ],
  });
  assert.ok(got && !isUnexpandedDiscount(got));
  assert.deepEqual(got, {
    couponId: "co_live_30",
    percentOff: 30,
    amountOffCents: null,
    currency: null,
    endsAt: new Date(1893456000 * 1000).toISOString(),
  });
});

test("a fixed-amount discount mirrors cents + currency", () => {
  const got = extractSubscriptionDiscount({
    discounts: [
      {
        end: null,
        source: { coupon: { id: "co_10off", amount_off: 1000, currency: "usd" } },
      },
    ],
  });
  assert.ok(got && !isUnexpandedDiscount(got));
  assert.equal(got.amountOffCents, 1000);
  assert.equal(got.currency, "usd");
  assert.equal(got.endsAt, null);
});

test("a discount whose coupon is only an id keeps the id and leaves values null", () => {
  // The caller fills these in with one coupon retrieve rather than guessing.
  const got = extractSubscriptionDiscount({
    discounts: [{ source: { coupon: "co_unexpanded" } }],
  });
  assert.ok(got && !isUnexpandedDiscount(got));
  assert.equal(got.couponId, "co_unexpanded");
  assert.equal(got.percentOff, null);
  assert.equal(got.amountOffCents, null);
});

test("the pre-v22 top-level coupon shape still reads", () => {
  const got = extractSubscriptionDiscount({
    discounts: [{ coupon: { id: "co_legacy", percent_off: 15 } }],
  });
  assert.ok(got && !isUnexpandedDiscount(got));
  assert.equal(got.couponId, "co_legacy");
  assert.equal(got.percentOff, 15);
});
