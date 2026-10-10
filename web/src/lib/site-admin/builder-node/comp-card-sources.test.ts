/**
 * TUL-209: comp_card group headings must resolve ES/EN from name_i18n
 * (or curated maps), never English title-case of the slug on Spanish pages.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCompCardGroupLabel } from "./comp-card-sources";

test("resolveCompCardGroupLabel prefers name_i18n for the visitor locale", () => {
  const map = {
    en: "Rates & booking",
    es: "Tarifas y reservas",
  };
  assert.equal(resolveCompCardGroupLabel("rates-booking", "es", map), "Tarifas y reservas");
  assert.equal(resolveCompCardGroupLabel("rates-booking", "en", map), "Rates & booking");
  assert.equal(resolveCompCardGroupLabel("rates-booking", "es-MX", map), "Tarifas y reservas");
});

test("resolveCompCardGroupLabel curated fallbacks cover Folio Live QA slugs on ES", () => {
  const cases: Array<[string, string]> = [
    ["context-best-fit", "Contextos ideales"],
    ["operational-requirements", "Requisitos operativos"],
    ["certifications-documents", "Certificaciones y documentos"],
    ["media-portfolio", "Medios y portafolio"],
    ["rates-booking", "Tarifas y reservas"],
  ];
  for (const [slug, es] of cases) {
    assert.equal(resolveCompCardGroupLabel(slug, "es", null), es);
    assert.notEqual(
      resolveCompCardGroupLabel(slug, "es", null),
      slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      `${slug} must not English title-case on ES`,
    );
  }
});

test("resolveCompCardGroupLabel empty slug uses Details/Detalles", () => {
  assert.equal(resolveCompCardGroupLabel(null, "en"), "Details");
  assert.equal(resolveCompCardGroupLabel(null, "es"), "Detalles");
});
