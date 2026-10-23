import test from "node:test";
import assert from "node:assert/strict";

import { localizedPickerTitle } from "./picker-title";

const row = { title: "QA USD class (test)", title_i18n: { es: "Clase USD QA (prueba)" } };

test("TUL-1922: the picker uses title_i18n for the page locale, like /book", () => {
  assert.equal(localizedPickerTitle(row, "es"), "Clase USD QA (prueba)");
});

test("TUL-1922: base title is the fallback (en, no locale, no translation)", () => {
  assert.equal(localizedPickerTitle(row, "en"), "QA USD class (test)");
  assert.equal(localizedPickerTitle(row, undefined), "QA USD class (test)");
  assert.equal(localizedPickerTitle({ title: "Yoga", title_i18n: null }, "es"), "Yoga");
  assert.equal(localizedPickerTitle({ title: " ", title_i18n: {} }, "es"), "Class");
});
