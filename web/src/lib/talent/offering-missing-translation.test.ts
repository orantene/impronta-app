import assert from "node:assert/strict";
import test from "node:test";

import { missingTitleLocale } from "./offering-missing-translation";

test("two languages, secondary title empty: the secondary is missing", () => {
  assert.equal(missingTitleLocale({ title: "Haircut", titleI18n: { en: "Haircut" } }, "en", ["en", "es"]), "es");
  assert.equal(missingTitleLocale({ title: "Haircut" }, "en", ["en", "es"]), "es");
  assert.equal(missingTitleLocale({ title: "Haircut", titleI18n: { es: "   " } }, "en", ["en", "es"]), "es");
});

test("two languages, both titled: nothing to show", () => {
  assert.equal(missingTitleLocale({ title: "Haircut", titleI18n: { es: "Corte" } }, "en", ["en", "es"]), null);
});

test("primary title empty but secondary filled: the primary is missing", () => {
  assert.equal(missingTitleLocale({ title: "", titleI18n: { es: "Corte" } }, "en", ["en", "es"]), "en");
  assert.equal(missingTitleLocale({ title: "  ", titleI18n: { en: "Cut" } }, "es", ["es", "en"]), "es");
});

test("untitled in both languages is not a translation gap", () => {
  assert.equal(missingTitleLocale({ title: "", titleI18n: {} }, "en", ["en", "es"]), null);
});

test("one language or three or more never shows the cue", () => {
  assert.equal(missingTitleLocale({ title: "Haircut" }, "en", ["en"]), null);
  assert.equal(missingTitleLocale({ title: "Haircut" }, "en", []), null);
  assert.equal(missingTitleLocale({ title: "Haircut" }, "en", ["en", "es", "fr"]), null);
});

test("primary not among the locales fails closed", () => {
  assert.equal(missingTitleLocale({ title: "Haircut" }, "fr", ["en", "es"]), null);
});

test("the plain title wins over a stale primary entry in the map", () => {
  assert.equal(missingTitleLocale({ title: "New", titleI18n: { en: "", es: "Nuevo" } }, "en", ["en", "es"]), null);
});
