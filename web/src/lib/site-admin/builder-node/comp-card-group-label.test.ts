/**
 * TUL-209 — comp_card group headings follow the visitor locale.
 * Live QA FAIL on sofia-barra /es showed English title-cased slugs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCompCardGroupLabel } from "./comp-card-group-label";

const LIVE_QA_SLUGS = [
  "context-best-fit",
  "operational-requirements",
  "certifications-documents",
  "media-portfolio",
  "rates-booking",
] as const;

test("curated catalog groups are Spanish on es (Live QA sofia-barra set)", () => {
  for (const slug of LIVE_QA_SLUGS) {
    const es = resolveCompCardGroupLabel(slug, "es");
    const en = resolveCompCardGroupLabel(slug, "en");
    assert.notEqual(es, en, `${slug} must differ by locale`);
    assert.match(es, /[áéíóúñÁÉÍÓÚÑ]| \/ |Requisitos|Portafolio|Tarifas|Mejor|Certificaciones/);
    assert.doesNotMatch(es, /^Context Best Fit$/);
    assert.doesNotMatch(es, /^Media Portfolio$/);
    assert.doesNotMatch(es, /^Rates Booking$/);
    assert.doesNotMatch(es, /^Certifications Documents$/);
    assert.doesNotMatch(es, /^Operational Requirements$/);
  }
});

test("name_i18n from DB wins over curated slug map", () => {
  const label = resolveCompCardGroupLabel("media-portfolio", "es", {
    en: "Media / Portfolio",
    es: "Portafolio personalizado",
  });
  assert.equal(label, "Portafolio personalizado");
});

test("name_i18n English when locale is en", () => {
  const label = resolveCompCardGroupLabel("rates-booking", "en", {
    en: "Rates / Booking Terms",
    es: "Tarifas / Condiciones",
  });
  assert.equal(label, "Rates / Booking Terms");
});

test("null slug falls back to Details / Detalles", () => {
  assert.equal(resolveCompCardGroupLabel(null, "en"), "Details");
  assert.equal(resolveCompCardGroupLabel(null, "es"), "Detalles");
});

test("unknown slug title-cases as last resort", () => {
  assert.equal(resolveCompCardGroupLabel("custom_group_x", "es"), "Custom Group X");
});
