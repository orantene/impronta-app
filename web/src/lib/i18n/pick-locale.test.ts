import assert from "node:assert/strict";
import test from "node:test";

import { pickLocale } from "@/lib/i18n/pick-locale";

test("pickLocale: es locale returns the es entry", () => {
  assert.equal(pickLocale("es", { en: "Height", es: "Estatura" }), "Estatura");
});

test("pickLocale: en locale returns the en entry", () => {
  assert.equal(pickLocale("en", { en: "Height", es: "Estatura" }), "Height");
});

test("pickLocale: byte-identical to `locale === 'es' ? es : en` for en/es", () => {
  // The whole safety bar: for the only two locales that exist today the helper
  // must return exactly what the old ternary returned.
  for (const locale of ["en", "es"]) {
    const ternary = locale === "es" ? "ES" : "EN";
    assert.equal(pickLocale(locale, { en: "EN", es: "ES" }), ternary);
  }
});

test("pickLocale: a 3rd locale with no entry falls back to en (graceful, same as today)", () => {
  // Old ternary: fr !== 'es' → en. New helper: no fr key → fallback en. Identical.
  assert.equal(pickLocale("fr", { en: "Height", es: "Estatura" }), "Height");
  assert.equal(pickLocale("pt-BR", { en: "Height", es: "Estatura" }), "Height");
});

test("pickLocale: a 3rd locale surfaces its own entry once supplied", () => {
  assert.equal(
    pickLocale("fr", { en: "Height", es: "Estatura", fr: "Taille" }),
    "Taille",
  );
});

test("pickLocale: an explicit undefined entry is skipped and falls back to en", () => {
  assert.equal(
    pickLocale("fr", { en: "Height", es: "Estatura", fr: undefined }),
    "Height",
  );
});

test("pickLocale: null/undefined locale falls back to en", () => {
  assert.equal(pickLocale(null, { en: "Height", es: "Estatura" }), "Height");
  assert.equal(pickLocale(undefined, { en: "Height", es: "Estatura" }), "Height");
});

test("pickLocale: works with non-string entries (objects, JSX-like values)", () => {
  const en = { title: "Hello" };
  const es = { title: "Hola" };
  assert.equal(pickLocale("es", { en, es }), es);
  assert.equal(pickLocale("en", { en, es }), en);
  assert.equal(pickLocale("de", { en, es }), en);
});

test("pickLocale: a custom fallback chain is honoured before en", () => {
  // fr missing → try es before en.
  assert.equal(
    pickLocale("fr", { en: "EN", es: "ES" }, ["es", "en"]),
    "ES",
  );
});

test("pickLocale: BCP-47 region codes are matched exactly (no base-language coercion)", () => {
  // `pt-BR` is its own key; a bare `pt` entry is NOT used for `pt-BR` (matches the
  // exactness of the old `locale === 'es'` equality check).
  assert.equal(
    pickLocale("pt-BR", { en: "EN", pt: "PT" }),
    "EN",
  );
  assert.equal(
    pickLocale("pt-BR", { en: "EN", pt: "PT", "pt-BR": "PT-BR" }),
    "PT-BR",
  );
});
