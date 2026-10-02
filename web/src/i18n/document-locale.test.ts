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
