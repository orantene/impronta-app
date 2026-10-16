import test from "node:test";
import assert from "node:assert/strict";
import { matchingCategorySlugs } from "./directory-category-search";

const rows = [
  { slug: "cleaner", name_i18n: { en: "Cleaner", es: "Limpiador" } },
  { slug: "airbnb-cleaner", name_i18n: { en: "Airbnb Cleaner", es: "Limpieza de Airbnb" } },
  { slug: "house-manager", name_i18n: { en: "House Manager", es: "Gerente de Casa" } },
  { slug: "dental-hygienist", name_i18n: { en: "Dental Hygienist", es: "Higienista dental" } },
  { slug: "lash-artist", name_i18n: { en: "Lash Artist", es: "Lashista" } },
];

test("TUL-802: 'limpieza' finds the cleaning types, not the dental hygienist", () => {
  const s = matchingCategorySlugs(rows, "limpieza");
  assert.ok(s.includes("cleaner") && s.includes("airbnb-cleaner"));
  assert.ok(!s.includes("dental-hygienist") && !s.includes("lash-artist"));
});

test("'casa' finds house cleaning by intent, and the house manager by name", () => {
  const s = matchingCategorySlugs(rows, "Casa");
  assert.ok(s.includes("cleaner") && s.includes("house-manager"));
});

test("accent and case folded; short or empty text matches nothing", () => {
  assert.ok(matchingCategorySlugs(rows, "LIMPIEZA DE AIRBNB").includes("airbnb-cleaner"));
  assert.deepEqual(matchingCategorySlugs(rows, "li"), []);
  assert.deepEqual(matchingCategorySlugs(rows, "  "), []);
});
