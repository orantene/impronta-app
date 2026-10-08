import assert from "node:assert/strict";
import test from "node:test";

import { defaultCreateTypeForFamily, defaultCurrencyForCountry } from "./service-defaults";

test("Mexico defaults to MXN, others keep the fallback", () => {
  assert.equal(defaultCurrencyForCountry("MX", "USD"), "MXN");
  assert.equal(defaultCurrencyForCountry(" México ", "USD"), "MXN");
  assert.equal(defaultCurrencyForCountry("Spain", "USD"), "USD");
  assert.equal(defaultCurrencyForCountry(null, "USD"), "USD");
});

test("beauty and other service families start on Service, dining on Product", () => {
  assert.equal(defaultCreateTypeForFamily("beauty"), "service");
  assert.equal(defaultCreateTypeForFamily("wellness"), "service");
  assert.equal(defaultCreateTypeForFamily("custom"), "service");
  assert.equal(defaultCreateTypeForFamily(null), "service");
  assert.equal(defaultCreateTypeForFamily("dining"), "product");
});
