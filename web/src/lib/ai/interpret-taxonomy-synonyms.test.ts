import test from "node:test";
import assert from "node:assert/strict";

import type { InterpretCatalogTerm } from "@/lib/ai/interpret-search-catalog";
import { resolveSynonymTaxonomyIds } from "@/lib/ai/interpret-taxonomy-synonyms";

const catalog: InterpretCatalogTerm[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "fit_label",
    slug: "presenting-female",
    name_en: "Female presenting",
    name_es: "Presentación femenina",
    aliases: ["woman", "women", "female", "mujer"],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "fit_label",
    slug: "hair-blonde",
    name_en: "Blonde hair",
    name_es: "Cabello rubio",
    aliases: ["blonde", "blond", "rubia"],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "talent_type",
    slug: "model",
    name_en: "Model",
    name_es: "Modelo",
    aliases: ["modelo"],
  },
];

test("resolveSynonymTaxonomyIds matches CMS aliases for woman / mujer", () => {
  const w = resolveSynonymTaxonomyIds("woman", catalog, 6, 3);
  assert.ok(w.includes("11111111-1111-4111-8111-111111111111"));
  const es = resolveSynonymTaxonomyIds("mujer 177 cm", catalog, 6, 3);
  assert.ok(es.includes("11111111-1111-4111-8111-111111111111"));
});

test("resolveSynonymTaxonomyIds matches hair aliases for blond without model token", () => {
  const ids = resolveSynonymTaxonomyIds("blond from ibiza", catalog, 6, 3);
  assert.ok(ids.includes("22222222-2222-4222-8222-222222222222"));
});
