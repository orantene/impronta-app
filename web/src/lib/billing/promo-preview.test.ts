import test from "node:test";
import assert from "node:assert/strict";
import {
  computePromoPreview,
  discountAppliesToTier,
  PROMO_ERROR_MESSAGES,
} from "./promo-preview";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";

function row(over: Partial<PricingDiscountRow>): PricingDiscountRow {
  return {
    id: "d1", code: "TESTPRO20", name: "t", kind: "percent", value: 20, currency: null,
    appliesTo: "all", appliesFamily: null, duration: "repeating", durationMonths: 3,
    maxRedemptions: null, redemptionCount: 0, perCustomerLimit: 1, startsAt: null, endsAt: null,
    firstTimeOnly: false, minimumAmountCents: null, minimumAmountCurrency: null, campaign: null,
    source: "admin", stripeCouponId: "co", stripePromotionCodeId: "promo", isActive: true,
    ...over,
  };
}

test("20% x 3 months previews 80% of the price", () => {
  const p = computePromoPreview(row({}), 1900);
  assert.equal(p.discountedCents, 1520);
  assert.equal(p.months, 3);
  assert.equal(p.label.en, "20% off for 3 months");
  assert.equal(p.label.es, "20% de descuento por 3 meses");
});

test("100% first month is free for one month", () => {
  const p = computePromoPreview(row({ value: 100, durationMonths: 1 }), 1900);
  assert.equal(p.discountedCents, 0);
  assert.equal(p.label.en, "100% off for 1 month");
});

test("free_months kind is free for N months", () => {
  const p = computePromoPreview(row({ kind: "free_months", value: 2, duration: "once", durationMonths: null }), 1900);
  assert.equal(p.discountedCents, 0);
  assert.equal(p.months, 2);
});

test("fixed amount never goes below zero", () => {
  const p = computePromoPreview(row({ kind: "fixed", value: 50, duration: "forever", durationMonths: null }), 1900);
  assert.equal(p.discountedCents, 0);
  assert.equal(p.months, null);
});

test("tier scope: all, listed, unlisted, unknown tier", () => {
  assert.equal(discountAppliesToTier("all", null), true);
  assert.equal(discountAppliesToTier(["t1"], "t1"), true);
  assert.equal(discountAppliesToTier(["t1"], "t2"), false);
  assert.equal(discountAppliesToTier(["t1"], null), false);
});

test("every error code has EN and ES copy without em dashes", () => {
  for (const m of Object.values(PROMO_ERROR_MESSAGES)) {
    assert.ok(m.en && m.es);
    assert.ok(!m.en.includes("—") && !m.es.includes("—"));
  }
});
