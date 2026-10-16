import assert from "node:assert/strict";
import test from "node:test";
import { countryForStorage, countryLabel, normalizeCountryCode } from "./country-code";

test("every Mexico spelling normalises to MX", () => {
  for (const v of ["MX", "mx", "México", "Mexico", "mexico", " MEXICO ", "🇲🇽 México"]) {
    assert.equal(normalizeCountryCode(v), "MX", v);
  }
});

test("other countries and aliases", () => {
  assert.equal(normalizeCountryCode("United States"), "US");
  assert.equal(normalizeCountryCode("Estados Unidos"), "US");
  assert.equal(normalizeCountryCode("USA"), "US");
  assert.equal(normalizeCountryCode("Argentina"), "AR");
  assert.equal(normalizeCountryCode("South Africa"), "ZA");
  assert.equal(normalizeCountryCode("FR"), "FR");
});

test("unknown input is not guessed", () => {
  assert.equal(normalizeCountryCode("Narnia"), null);
  assert.equal(normalizeCountryCode("ZZ"), null);
  assert.equal(normalizeCountryCode(""), null);
  assert.equal(normalizeCountryCode(null), null);
});

test("countryForStorage keeps unrecognised text and empties to null", () => {
  assert.equal(countryForStorage("México"), "MX");
  assert.equal(countryForStorage("Narnia"), "Narnia");
  assert.equal(countryForStorage("  "), null);
  assert.equal(countryForStorage(undefined), null);
});

test("countryLabel shows names for codes and passes text through", () => {
  assert.equal(countryLabel("MX", "en"), "Mexico");
  assert.equal(countryLabel("MX", "es"), "México");
  assert.equal(countryLabel("Narnia"), "Narnia");
  assert.equal(countryLabel(null), null);
});
