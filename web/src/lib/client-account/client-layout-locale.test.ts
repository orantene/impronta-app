/** TUL-968: the client portal follows the visitor's language on unprefixed URLs. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { pickClientLayoutLocale, urlNamesLocale } from "./client-layout-locale";

test("urlNamesLocale: a /es or /en prefix, or ?lang= / ?locale=, names the language", () => {
  assert.equal(urlNamesLocale("/es/hub/client/today", ""), true);
  assert.equal(urlNamesLocale("/en", null), true);
  assert.equal(urlNamesLocale("/hub/client/today", "?lang=es"), true);
  assert.equal(urlNamesLocale("/hub/client/today", "locale=en"), true);
  assert.equal(urlNamesLocale("/hub/client/today", "?lang=fr"), false);
  assert.equal(urlNamesLocale("/hub/client/today", ""), false);
  assert.equal(urlNamesLocale("/espacio", null), false);
});

test("an unprefixed URL follows the language cookie over the path-derived English default", () => {
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: false, cookieLocale: "es", savedLocale: null }), "es");
});

test("with no cookie, the client's saved account language is used", () => {
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: false, cookieLocale: undefined, savedLocale: "es" }), "es");
});

test("an explicit language in the URL wins over cookie and saved language", () => {
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: true, cookieLocale: "es", savedLocale: "es" }), "en");
  assert.equal(pickClientLayoutLocale({ requestLocale: "es", urlNamesLocale: true, cookieLocale: "en", savedLocale: "en" }), "es");
});

test("unsupported or missing values fall back to the request locale, then English", () => {
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: false, cookieLocale: "fr", savedLocale: "" }), "en");
  assert.equal(pickClientLayoutLocale({ requestLocale: "pt", urlNamesLocale: false, cookieLocale: null, savedLocale: null }), "en");
});
