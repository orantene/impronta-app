import assert from "node:assert/strict";
import test from "node:test";

import { editorT } from "./editor-i18n";
import {
  localizedSectionDisplayName,
  localizeSeededSectionName,
} from "./section-display-name-i18n";

const tEs = (s: string) => editorT(s, "es");
const tEn = (s: string) => editorT(s, "en");

test("TUL-748: a seeded section name shows in Spanish when the editor locale is es", () => {
  assert.equal(localizeSeededSectionName("Hero — new", tEs, "es"), "Portada — nuevo");
  assert.equal(
    localizeSeededSectionName("Featured professionals — new", tEs, "es"),
    "Profesionales destacados — nuevo",
  );
});

test("TUL-748: English stays English", () => {
  assert.equal(localizeSeededSectionName("Hero — new", tEn, "en"), "Hero — new");
});

test("TUL-748: a content headline is never translated", () => {
  assert.equal(
    localizedSectionDisplayName(
      { typeKey: "hero", rawName: "Hero — new", headline: "Hero" },
      tEs,
      "es",
    ),
    "Hero",
  );
});

test("TUL-748: fallback without a stored name uses the translated type label", () => {
  assert.equal(
    localizedSectionDisplayName({ typeKey: "gallery_strip", rawName: null }, tEs, "es"),
    "Franja de galería",
  );
});
