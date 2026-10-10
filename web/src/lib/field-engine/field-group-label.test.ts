import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveFieldGroupLabel } from "./field-group-label";

test("prefers DB name_es on Spanish locales", () => {
  assert.equal(
    resolveFieldGroupLabel("context-best-fit", "es", {
      name_en: "Best Fit / Contexts",
      name_es: "Mejor Uso / Contexto",
    }),
    "Mejor Uso / Contexto",
  );
});

test("prefers DB name_en on English locales", () => {
  assert.equal(
    resolveFieldGroupLabel("rates-booking", "en", {
      name_en: "Rates / Booking Terms",
      name_es: "Tarifas / Condiciones",
    }),
    "Rates / Booking Terms",
  );
});

test("curated map covers Live QA EN-on-ES headings when names missing", () => {
  const cases: Array<[string, string]> = [
    ["context-best-fit", "Mejor Uso / Contexto"],
    ["operational-requirements", "Requisitos Operativos"],
    ["certifications-documents", "Certificaciones / Documentos"],
    ["media-portfolio", "Media / Portafolio"],
    ["rates-booking", "Tarifas / Condiciones"],
  ];
  for (const [slug, es] of cases) {
    assert.equal(resolveFieldGroupLabel(slug, "es"), es);
    // Must never title-case the slug into English on Spanish pages
    assert.doesNotMatch(resolveFieldGroupLabel(slug, "es"), /Context Best Fit|Operational Requirements|Certifications Documents|Media Portfolio|Rates Booking/);
  }
});

test("null slug falls back to Detalles / Details", () => {
  assert.equal(resolveFieldGroupLabel(null, "es"), "Detalles");
  assert.equal(resolveFieldGroupLabel(undefined, "en"), "Details");
});

test("unknown slug does not invent English title-case", () => {
  assert.equal(resolveFieldGroupLabel("brand-new-group", "es"), "Detalles");
  assert.equal(resolveFieldGroupLabel("brand-new-group", "en"), "Details");
});
