import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveTalentCurrency,
  deriveTalentLocale,
  topAcceptLanguage,
} from "./signup-defaults";

test("Mexican phone defaults to es + MXN", () => {
  assert.equal(deriveTalentLocale({ phone: "+52 55 1234 5678", acceptLanguage: "en-US" }), "es");
  assert.equal(deriveTalentCurrency("+52 55 1234 5678"), "MXN");
});

test("other Spanish-speaking countries get es but no currency override", () => {
  assert.equal(deriveTalentLocale({ phone: "+34 600 000 000" }), "es");
  assert.equal(deriveTalentLocale({ phone: "+593 99 123 4567" }), "es");
  assert.equal(deriveTalentCurrency("+34 600 000 000"), null);
});

test("non-Spanish phone falls back to Accept-Language, then en", () => {
  assert.equal(deriveTalentLocale({ phone: "+1 555 000 1111", acceptLanguage: "es-MX,es;q=0.9" }), "es");
  assert.equal(deriveTalentLocale({ phone: "+1 555 000 1111", acceptLanguage: "en-US,en;q=0.9" }), "en");
  assert.equal(deriveTalentLocale({}), "en");
  assert.equal(deriveTalentCurrency("+1 555 000 1111"), null);
  assert.equal(deriveTalentCurrency(""), null);
});

test("topAcceptLanguage reads the first tag", () => {
  assert.equal(topAcceptLanguage("es-MX;q=0.9,en;q=0.8"), "es");
  assert.equal(topAcceptLanguage(null), null);
});
