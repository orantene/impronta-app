import test from "node:test";
import assert from "node:assert/strict";
import { normalizePromoParam } from "./promo-code-param";

/**
 * The value comes off the address bar, so the interesting cases are the junk
 * ones. Nothing here is a security boundary — `resolveCheckoutDiscount`
 * re-validates server-side — but a code that reaches Stripe malformed produces
 * a silent full-price checkout, which is the failure this whole thread exists
 * to remove.
 */

test("normalises the shapes a real campaign link produces", () => {
  assert.equal(normalizePromoParam("TULALA50LIMITADO"), "TULALA50LIMITADO");
  assert.equal(normalizePromoParam("  tulala2free  "), "TULALA2FREE");
  assert.equal(normalizePromoParam("launch-50_b"), "LAUNCH-50_B");
});

test("drops what cannot be a stored code", () => {
  for (const bad of [null, undefined, "", "   ", "AB", "a".repeat(33)]) {
    assert.equal(normalizePromoParam(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("rejects characters the create form never allows", () => {
  // A mangled or injected link should send nothing rather than something.
  for (const bad of ["FREE 50", "50%OFF", "code;drop", "<script>", "año50"]) {
    assert.equal(normalizePromoParam(bad), null, `expected null for ${bad}`);
  }
});

test("boundary lengths are inclusive", () => {
  assert.equal(normalizePromoParam("ABC"), "ABC");
  assert.equal(normalizePromoParam("A".repeat(32)), "A".repeat(32));
});
