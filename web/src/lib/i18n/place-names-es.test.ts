import assert from "node:assert/strict";
import { test } from "node:test";
import { spanishPlaceName } from "./place-names-es";

// TUL-738: /es/directory showed "Mexico", "Mexico City" and "Cancun".
test("known places get their Spanish spelling on a Spanish page", () => {
  assert.equal(spanishPlaceName("Mexico", "es"), "México");
  assert.equal(spanishPlaceName("Mexico City", "es"), "Ciudad de México");
  assert.equal(spanishPlaceName("Cancun", "es"), "Cancún");
  assert.equal(spanishPlaceName("cancun", "es-MX"), "Cancún");
});

test("English pages and unknown places pass through untouched", () => {
  assert.equal(spanishPlaceName("Mexico City", "en"), "Mexico City");
  assert.equal(spanishPlaceName("Tulum", "es"), "Tulum");
  assert.equal(spanishPlaceName("", "es"), "");
});
