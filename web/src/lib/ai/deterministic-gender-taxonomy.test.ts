import test from "node:test";
import assert from "node:assert/strict";

import type { InterpretCatalogTerm } from "@/lib/ai/interpret-search-catalog";
import { resolveDeterministicGenderTaxonomyIds } from "@/lib/ai/deterministic-gender-taxonomy";

const catalog: InterpretCatalogTerm[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    kind: "fit_label",
    slug: "presenting-female",
    name_en: "Female presenting",
    name_es: null,
    aliases: [],
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    kind: "fit_label",
    slug: "presenting-male",
    name_en: "Male presenting",
    name_es: null,
    aliases: [],
  },
];

test("resolveDeterministicGenderTaxonomyIds maps woman and mujer to presenting-female", () => {
  assert.deepEqual(resolveDeterministicGenderTaxonomyIds("woman", catalog), [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ]);
  assert.deepEqual(resolveDeterministicGenderTaxonomyIds("mujer 177 cm", catalog), [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ]);
});

test("resolveDeterministicGenderTaxonomyIds maps male Spanish tokens to presenting-male", () => {
  assert.deepEqual(resolveDeterministicGenderTaxonomyIds("chico modelo", catalog), [
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ]);
});

test("resolveDeterministicGenderTaxonomyIds can return both when query names both", () => {
  const ids = resolveDeterministicGenderTaxonomyIds("male and female models", catalog);
  assert.equal(ids.length, 2);
  assert.ok(ids.includes("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
  assert.ok(ids.includes("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
});

test("resolveDeterministicGenderTaxonomyIds returns empty when slugs missing from catalog", () => {
  assert.deepEqual(resolveDeterministicGenderTaxonomyIds("woman", []), []);
});
