import assert from "node:assert/strict";
import { test } from "node:test";
import { localizedCurrencyLabel, DEFAULT_CURRENCY_OPTIONS } from "./currencies";

test("English keeps the static label", () => {
  assert.equal(localizedCurrencyLabel("MXN", "en"), "MXN · $ · Mexican Peso");
});
test("Spanish localizes the currency name, keeps code and symbol", () => {
  assert.equal(localizedCurrencyLabel("MXN", "es"), "MXN · $ · Peso mexicano");
  assert.match(localizedCurrencyLabel("USD", "es"), /^USD · \$ · Dólar estadounidense$/);
});
test("every option has a label in es", () => {
  for (const c of DEFAULT_CURRENCY_OPTIONS) {
    assert.ok(localizedCurrencyLabel(c, "es").startsWith(`${c} · `));
  }
});
