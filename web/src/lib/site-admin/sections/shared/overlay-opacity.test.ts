import assert from "node:assert/strict";
import { test } from "node:test";

import { overlayOpacityToUnitInterval } from "./overlay-opacity";

test("0–1 floats pass through", () => {
  assert.equal(overlayOpacityToUnitInterval(0), 0);
  assert.equal(overlayOpacityToUnitInterval(0.45), 0.45);
  assert.equal(overlayOpacityToUnitInterval(1), 1);
});

test("0–100 ints convert to 0–1", () => {
  assert.equal(overlayOpacityToUnitInterval(45), 0.45);
  assert.equal(overlayOpacityToUnitInterval(100), 1);
  assert.equal(overlayOpacityToUnitInterval(0), 0);
});

test("nullish and non-finite return undefined", () => {
  assert.equal(overlayOpacityToUnitInterval(undefined), undefined);
  assert.equal(overlayOpacityToUnitInterval(null), undefined);
  assert.equal(overlayOpacityToUnitInterval(Number.NaN), undefined);
});
