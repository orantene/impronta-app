import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { whatLabelFor } from "./what-label";

const term = { id: "t1", slug: "portrait-photographer", label: { en: "Portrait Photographer", es: "Fotógrafo de Retrato" } };

test("TUL-993: the untouched proposal keeps the person's own words, sentence case", () => {
  assert.equal(whatLabelFor({ picked: term, proposed: term, userWords: "fotógrafa de retratos", locale: "es" }), "Fotógrafa de retratos");
});

test("a type the person picked keeps the catalogue name", () => {
  const other = { ...term, id: "t2", label: { en: "Model", es: "Modelo" } };
  assert.equal(whatLabelFor({ picked: other, proposed: term, userWords: "fotógrafa de retratos", locale: "es" }), "Modelo");
});

test("no words: the catalogue name", () => {
  assert.equal(whatLabelFor({ picked: term, proposed: term, userWords: null, locale: "en" }), "Portrait Photographer");
});

test("the essentials step uses whatLabelFor for display and save", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/essentials-step.tsx"), "utf8");
  assert.ok((src.match(/whatLabelFor\(/g) ?? []).length >= 1);
});
