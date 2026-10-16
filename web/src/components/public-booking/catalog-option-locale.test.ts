import assert from "node:assert/strict";
import test from "node:test";

import { buildTalentLocaleSwaps } from "@/lib/talent-site/talent-locale-swaps";

import { localizeOptionLabels } from "./catalog-option-locale";

test("TUL-876: option labels follow the visitor's language, plain label otherwise", () => {
  const d = {
    variants: [
      { id: "a", label: "Casa", labelI18n: { es: "Casa", en: "House" } },
      { id: "b", label: "Local comercial", labelI18n: { es: "Local comercial" } },
      { id: "c", label: "Oficina" },
    ],
    addOns: [{ id: "x", label: "Urgente", labelI18n: { en: "Rush" } }],
  };
  const en = localizeOptionLabels(d, "en");
  assert.deepEqual(en.variants?.map((v) => v.label), ["House", "Local comercial", "Oficina"]);
  assert.equal(en.addOns?.[0]?.label, "Rush");
  assert.deepEqual(localizeOptionLabels(d, "es-MX").variants?.map((v) => v.label), ["Casa", "Local comercial", "Oficina"]);
});

test("TUL-876: a hero bio baked in Spanish swaps to the English bio on /en, only when she wrote one", () => {
  const es = "Soy diseñador de interiores en Mérida.";
  const src = { bioI18n: { es, en: "I am an interior designer in Merida." }, typeNames: [], homeCity: null };
  assert.equal(buildTalentLocaleSwaps(src, "en")[es], "I am an interior designer in Merida.");
  assert.equal(buildTalentLocaleSwaps({ ...src, bioI18n: { es } }, "en")[es], undefined);
});
