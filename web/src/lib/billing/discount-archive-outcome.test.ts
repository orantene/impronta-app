import assert from "node:assert/strict";
import test from "node:test";

import { archiveOutcome } from "./discount-archive-outcome";
import { isPromoSyncedToStripe } from "./promo-preview";

test("a confirmed or stubbed Stripe archive is a success", () => {
  assert.deepEqual(archiveOutcome({ ok: true, stub: false }), { ok: true });
  assert.deepEqual(archiveOutcome({ ok: true, stub: true, reason: "No Stripe Promotion Code linked." }), { ok: true });
});

test("a failed Stripe archive is reported, never swallowed", () => {
  const out = archiveOutcome({ ok: false, error: "rate limited" });
  assert.equal(out.ok, false);
  assert.match(out.ok ? "" : out.error, /may still work in Stripe/);
  assert.match(out.ok ? "" : out.error, /rate limited/);
});

test("a code with no Stripe ids is not offered as discounted when Stripe is connected", () => {
  assert.equal(isPromoSyncedToStripe({ stripeCouponId: null, stripePromotionCodeId: null }, true), false);
  assert.equal(isPromoSyncedToStripe({ stripeCouponId: "co_1", stripePromotionCodeId: null }, true), true);
  assert.equal(isPromoSyncedToStripe({ stripeCouponId: null, stripePromotionCodeId: "promo_1" }, true), true);
  assert.equal(isPromoSyncedToStripe({ stripeCouponId: " ", stripePromotionCodeId: "" }, true), false);
  // No Stripe at all (local DB-only mode): the preview keeps working.
  assert.equal(isPromoSyncedToStripe({ stripeCouponId: null, stripePromotionCodeId: null }, false), true);
});
