/** TUL-968: the client portal follows the visitor's language on unprefixed URLs. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { localeFromAcceptLanguage, pickClientLayoutLocale, urlNamesLocale } from "./client-layout-locale";

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

test("TUL-968: Accept-Language carries Spanish across hosts when no cookie or saved language exists", () => {
  assert.equal(localeFromAcceptLanguage("es-MX,es;q=0.9,en;q=0.8"), "es");
  assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9,es;q=0.8"), "en");
  assert.equal(localeFromAcceptLanguage("fr-FR,fr;q=0.9,es;q=0.5"), "es");
  assert.equal(localeFromAcceptLanguage("de,fr"), null);
  assert.equal(localeFromAcceptLanguage(""), null);
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: false, cookieLocale: undefined, savedLocale: null, acceptLanguage: "es-MX,es;q=0.9" }), "es");
});

test("TUL-968: cookie, saved language and an explicit URL all still beat Accept-Language", () => {
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: false, cookieLocale: "en", savedLocale: "es", acceptLanguage: "es" }), "en");
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: false, cookieLocale: null, savedLocale: "en", acceptLanguage: "es" }), "en");
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: true, cookieLocale: null, savedLocale: null, acceptLanguage: "es" }), "en");
});

test("unsupported or missing values fall back to the request locale, then English", () => {
  assert.equal(pickClientLayoutLocale({ requestLocale: "en", urlNamesLocale: false, cookieLocale: "fr", savedLocale: "" }), "en");
  assert.equal(pickClientLayoutLocale({ requestLocale: "pt", urlNamesLocale: false, cookieLocale: null, savedLocale: null }), "en");
});
