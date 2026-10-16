import assert from "node:assert/strict";
import { test } from "node:test";
import { languageToggleGroupLabel } from "./language-toggle-label";

test("languageToggleGroupLabel: ES locales → Idioma", () => {
  assert.equal(languageToggleGroupLabel("es"), "Idioma");
  assert.equal(languageToggleGroupLabel("es-MX"), "Idioma");
  assert.equal(languageToggleGroupLabel("ES"), "Idioma");
});

test("languageToggleGroupLabel: EN / missing → Language", () => {
  assert.equal(languageToggleGroupLabel("en"), "Language");
  assert.equal(languageToggleGroupLabel("en-US"), "Language");
  assert.equal(languageToggleGroupLabel(undefined), "Language");
  assert.equal(languageToggleGroupLabel(null), "Language");
  assert.equal(languageToggleGroupLabel(""), "Language");
});
