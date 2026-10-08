import { test } from "node:test";
import assert from "node:assert/strict";
import { offeringPriceLabel } from "./price-label";

test("on_request returns null", () => {
  assert.equal(offeringPriceLabel(70_000, "MXN", "on_request", "es"), null);
});

test("formats with guest locale (not hard-coded $ + en-US)", () => {
  const es = offeringPriceLabel(70_000, "MXN", "public", "es");
  assert.ok(es);
  assert.ok(/700/.test(es));
  // Must not be the old hard-coded "$700 MXN" shape.
  assert.equal(es === "$700 MXN", false);
});

test("invalid / zero amounts return null", () => {
  assert.equal(offeringPriceLabel(0, "MXN", "public", "en"), null);
  assert.equal(offeringPriceLabel(null, "MXN", "public", "en"), null);
});
