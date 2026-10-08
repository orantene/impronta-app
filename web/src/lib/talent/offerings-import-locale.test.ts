import assert from "node:assert/strict";
import { test } from "node:test";

import { importI18n, importLocaleKey } from "./offerings-import-locale";

test("importLocaleKey keeps the talent's primary locale", () => {
  assert.equal(importLocaleKey("es"), "es");
  assert.equal(importLocaleKey("en"), "en");
});

test("importLocaleKey falls back to en when settings are missing", () => {
  assert.equal(importLocaleKey(undefined), "en");
  assert.equal(importLocaleKey(null), "en");
  assert.equal(importLocaleKey("  "), "en");
});

test("importI18n keys text under the locale and nulls empty text", () => {
  assert.deepEqual(importI18n("es", "Sesion de fotos"), { es: "Sesion de fotos" });
  assert.deepEqual(importI18n("en", "Photo shoot"), { en: "Photo shoot" });
  assert.equal(importI18n("es", null), null);
  assert.equal(importI18n("es", ""), null);
});
