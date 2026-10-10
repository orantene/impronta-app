import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalCityName, citySlug, hasAccent, localizePlaceCity } from "./city-label";

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

test("Valeria's data: the location row is ASCII in both languages, the place text has the accent (data)", () => {
  const rowMap = { en: "Cancun", es: "Cancun" };
  assert.equal(canonicalCityName("Cancun", [rowMap], "es", ["Cancún"]), "Cancún");
  assert.equal(canonicalCityName("Cancun", [rowMap], "en", ["Cancún"]), "Cancún");
  assert.equal(canonicalCityName("Cancun", [rowMap], "es", ["Tulum"]), "Cancun", "a hint for another city is ignored");
});

test("hasAccent", () => {
  assert.ok(hasAccent("Cancún"));
  assert.ok(!hasAccent("Cancun"));
});

test("localizePlaceCity renames Mexico City for the page language", () => {
  assert.equal(localizePlaceCity("Mexico City", "es"), "Ciudad de México");
  assert.equal(localizePlaceCity("mexico city", "es-MX"), "Ciudad de México");
  assert.equal(localizePlaceCity("Ciudad de México", "en"), "Mexico City");
  assert.equal(localizePlaceCity("Morelia", "es"), "Morelia");
  assert.equal(localizePlaceCity("Houston", "en"), "Houston");
});
