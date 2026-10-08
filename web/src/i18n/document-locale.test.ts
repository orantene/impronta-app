import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDocumentLocale } from "./request-locale";

test("template-preview takes <html lang> from ?locale=", () => {
  assert.equal(resolveDocumentLocale("en", "/template-preview/live", "?kind=live-site&locale=es"), "es");
  assert.equal(resolveDocumentLocale("es", "/template-preview/live", "?locale=en"), "en");
  assert.equal(resolveDocumentLocale("en", "/dev/template-preview/x", "?locale=es"), "es");
});

test("every other route keeps the request locale, and a junk ?locale= is ignored", () => {
  assert.equal(resolveDocumentLocale("en", "/directory", "?locale=es"), "en");
  assert.equal(resolveDocumentLocale("en", "/template-preview/live", "?locale=fr"), "en");
  assert.equal(resolveDocumentLocale("en", "/template-preview/live", null), "en");
  assert.equal(resolveDocumentLocale("en", null, null), "en");
});

test("/start renders the flow language in the server HTML lang (TUL-117)", () => {
  // ?lang wins
  assert.equal(resolveDocumentLocale("en", "/start", "?lang=es"), "es");
  // Spanish browser, no ?lang
  assert.equal(resolveDocumentLocale("en", "/start", "", { acceptLanguage: "es-MX,es;q=0.9,en;q=0.8" }), "es");
  // Mexico by country
  assert.equal(resolveDocumentLocale("en", "/start", "", { country: "MX" }), "es");
  // English browser stays English
  assert.equal(resolveDocumentLocale("en", "/start", "", { acceptLanguage: "en-US,en;q=0.9" }), "en");
  // trailing slash, and other pages are untouched
  assert.equal(resolveDocumentLocale("en", "/start/", "?lang=es"), "es");
  assert.equal(resolveDocumentLocale("en", "/starting", "?lang=es"), "en");
});
