import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalCityName, citySlug, hasAccent } from "./city-label";

test("citySlug folds accents and punctuation to the locations slug", () => {
  assert.equal(citySlug("Cancún"), "cancun");
  assert.equal(citySlug("Playa del Carmen"), "playa-del-carmen");
  assert.equal(citySlug("Mérida, "), "merida");
});

test("an ASCII city takes the canonical accented name for the locale", () => {
  const maps = [{ en: "Cancún", es: "Cancún" }];
  assert.equal(canonicalCityName("Cancun", maps, "es"), "Cancún");
  assert.equal(canonicalCityName("Cancun", maps, "en"), "Cancún");
});

test("it never returns a different city, and no match keeps the text", () => {
  assert.equal(canonicalCityName("Tulum", [{ en: "Cancún" }], "es"), "Tulum");
  assert.equal(canonicalCityName("Cancun", [], "es"), "Cancun");
  assert.equal(canonicalCityName("", [{ es: "Cancún" }], "es"), "");
});

test("hasAccent", () => {
  assert.ok(hasAccent("Cancún"));
  assert.ok(!hasAccent("Cancun"));
});
