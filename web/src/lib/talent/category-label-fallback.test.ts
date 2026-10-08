/**
 * TUL-15: the platform dictionary for standard trade categories.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLATFORM_CATEGORY_DICTIONARY,
  platformCategoryLabel,
  resolveCategoryLabel,
} from "./category-label-fallback";

const none = { categoryI18n: null } as const;

test("Spanish category, English visitor: the dictionary English", () => {
  for (const [es, en] of [
    ["Pestañas", "Lashes"], ["Uñas", "Nails"], ["Cejas", "Brows"], ["Masajes", "Massages"],
    ["Depilación", "Waxing"], ["Cabello", "Hair"], ["Maquillaje", "Makeup"],
    ["Extensiones", "Extensions"], ["Eventos", "Events"], ["Talleres", "Workshops"], ["Clases", "Classes"],
  ] as const) {
    assert.equal(resolveCategoryLabel({ category: es, ...none, locale: "en", chain: ["en"] }), en);
  }
});

test("English category, Spanish visitor: the dictionary Spanish", () => {
  assert.equal(resolveCategoryLabel({ category: "Lashes", ...none, locale: "es", chain: ["es"] }), "Pestañas");
  assert.equal(resolveCategoryLabel({ category: "Nails", ...none, locale: "es" }), "Uñas");
});

test("already in the visitor's language: nothing to set", () => {
  assert.equal(resolveCategoryLabel({ category: "Pestañas", ...none, locale: "es" }), undefined);
  assert.equal(resolveCategoryLabel({ category: "Lashes", ...none, locale: "en" }), undefined);
  assert.equal(resolveCategoryLabel({ category: "Facial", ...none, locale: "en" }), undefined);
  assert.equal(resolveCategoryLabel({ category: "Lifting", ...none, locale: "es" }), undefined);
});

test("matching ignores case, accents and spacing", () => {
  assert.equal(platformCategoryLabel("pestanas", "en"), "Lashes");
  assert.equal(platformCategoryLabel("  PESTAÑAS ", "en"), "Lashes");
  assert.equal(platformCategoryLabel("DEPILACION", "en"), "Waxing");
  assert.equal(platformCategoryLabel("nails", "es"), "Uñas");
  assert.equal(platformCategoryLabel("Make-up", "es"), "Maquillaje");
});

test("an unknown category, or a phrase that only contains one, is untouched", () => {
  assert.equal(resolveCategoryLabel({ category: "Uñas y pedicura", ...none, locale: "en" }), undefined);
  assert.equal(resolveCategoryLabel({ category: "Cuidado", ...none, locale: "en" }), undefined);
  assert.equal(resolveCategoryLabel({ category: "", ...none, locale: "en" }), undefined);
  assert.equal(resolveCategoryLabel({ category: null, ...none, locale: "en" }), undefined);
});

test("a language the dictionary does not cover is untouched", () => {
  assert.equal(resolveCategoryLabel({ category: "Pestañas", ...none, locale: "fr" }), undefined);
});

test("the talent's own category_i18n always wins over the dictionary", () => {
  assert.equal(
    resolveCategoryLabel({ category: "Pestañas", categoryI18n: { en: "Eyelash studio" }, locale: "en", chain: ["en"] }),
    "Eyelash studio",
  );
  // An own entry equal to the written category means "no label": still not translated.
  assert.equal(
    resolveCategoryLabel({ category: "Pestañas", categoryI18n: { en: "Pestañas" }, locale: "en", chain: ["en"] }),
    undefined,
  );
});

test("dictionary copy has no em dashes and no duplicate terms", () => {
  const terms = new Set<string>();
  for (const p of PLATFORM_CATEGORY_DICTIONARY) {
    assert.ok(!p.en.includes("—") && !p.es.includes("—"));
    assert.ok(!terms.has(p.en), p.en);
    terms.add(p.en);
  }
});
