import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { PROMO_ERROR_MESSAGES, expiredPromoMessage, promoErrorFromReason } from "./promo-preview";

/**
 * TUL-1860: an expired code must be refused at EVERY apply point with a clear
 * message. `validateDiscount` is the one validator behind all of them; these pin
 * that each apply point goes through it and that the message is the expected one.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("validateDiscount's reasons for a code outside its window all map to the expired message", () => {
  for (const reason of ["Code has expired.", "Code is no longer active.", "Code hasn’t started yet.", "Code has reached its redemption limit."]) {
    assert.equal(promoErrorFromReason(reason), "expired", reason);
  }
  assert.equal(promoErrorFromReason("Code not found."), "invalid");
});

test("the expired copy is clear in en and es", () => {
  assert.match(PROMO_ERROR_MESSAGES.expired.en, /^This code has expired/);
  assert.match(PROMO_ERROR_MESSAGES.expired.es, /^Este código venció/);
  assert.equal(expiredPromoMessage("es-MX"), PROMO_ERROR_MESSAGES.expired.es);
  assert.equal(expiredPromoMessage(null), PROMO_ERROR_MESSAGES.expired.en);
});

test("every apply point uses the shared validator and the checkout builders refuse a rejected code", () => {
  const validate = read("src/lib/server-actions/admin-product-discounts.ts");
  assert.match(validate, /const status = discountStatus\(discount\);/);
  assert.match(read("src/lib/server-actions/validate-promo-code.ts"), /validateDiscount\(/); // Plan page preview
  assert.match(read("src/lib/billing/plan-change.server.ts"), /validate: \(c\) => validateDiscount\(c\)/); // in-app upgrade
  assert.match(read("src/lib/billing/checkout-discounts.ts"), /rejected: "expired"/); // checkout resolver
  for (const f of ["src/lib/stripe/talent-billing.ts", "src/lib/stripe/workspace-billing.ts"]) {
    assert.match(read(f), /if \(discount\.rejected\) return \{ ok: false, error: expiredPromoMessage\(opts\.locale\) \}/, f);
  }
});

test("admin create validates the window and edit checks start vs end", () => {
  assert.match(read("src/lib/server-actions/admin-product-discounts.ts"), /discountWindowError\(\{ startsAt: v\.startsAt, endsAt: v\.endsAt \}, "create"\)/);
  assert.match(read("src/lib/billing/discount-edit.ts"), /discountWindowError\(\{ startsAt: input\.startsAt, endsAt: row\.ends_at \}, "edit"\)/);
});

test("Stripe sync sends expires_at and max_redemptions on create; archive deactivates the promotion code", () => {
  const params = read("src/lib/pricing/discount-stripe-params.ts");
  assert.match(params, /params\.expires_at = unixSeconds\(input\.endsAt\)/);
  assert.match(params, /params\.max_redemptions = input\.maxRedemptions/);
  assert.match(read("src/lib/pricing/stripe-discount-sync.ts"), /promotionCodes\.update\(input\.stripePromotionCodeId, \{\s*active: false/);
});
