import assert from "node:assert/strict";
import { test } from "node:test";

import { notFoundLocale } from "./not-found-locale";

const base = { locale: "en", acceptLanguage: "es-MX,es;q=0.9,en;q=0.8", cookieLocale: null, pathname: "/w/qa-no-existe", search: "" };

test("unprefixed 404 with a Spanish browser and no explicit choice speaks Spanish (TUL-877/1079)", () => {
  assert.equal(notFoundLocale(base), "es");
});

test("an explicit choice wins: cookie, /en prefix or ?lang=", () => {
  assert.equal(notFoundLocale({ ...base, cookieLocale: "en" }), "en");
  assert.equal(notFoundLocale({ ...base, pathname: "/en/w/acme" }), "en");
  assert.equal(notFoundLocale({ ...base, search: "?lang=en" }), "en");
});

test("English browser, or an already-Spanish request, is unchanged", () => {
  assert.equal(notFoundLocale({ ...base, acceptLanguage: "en-US,en;q=0.9" }), "en");
  assert.equal(notFoundLocale({ ...base, locale: "es", acceptLanguage: "en-US" }), "es");
  assert.equal(notFoundLocale({ ...base, acceptLanguage: null }), "en");
});
