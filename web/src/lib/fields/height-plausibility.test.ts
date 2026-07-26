import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  isPlausibleHeightCm,
} from "./height-convert";

test("rejects the metres-typed-as-cm case that shipped to prod", () => {
  // Two live Impronta talents had height_cm = 2 and their public cards
  // rendered "HEIGHT 2 cm" to clients.
  assert.equal(isPlausibleHeightCm(2), false);
});

test("rejects other garbage without inventing a value", () => {
  for (const bad of [0, -5, 1.75, 5000, null, undefined, "", "tall", NaN]) {
    assert.equal(isPlausibleHeightCm(bad), false, `expected ${bad} rejected`);
  }
});

test("accepts the real roster range, inclusive at both bounds", () => {
  for (const ok of [HEIGHT_CM_MIN, 152, 173, 191, 210, HEIGHT_CM_MAX]) {
    assert.equal(isPlausibleHeightCm(ok), true, `expected ${ok} accepted`);
  }
});

test("window is wider than any casting range, so nobody real is hidden", () => {
  assert.ok(HEIGHT_CM_MIN <= 90 && HEIGHT_CM_MAX >= 250);
});
