/**
 * Comp-card group headings must use profile_field_groups.name_i18n
 * (TUL-209 Live QA: sofia-barra /es showed English slug titles).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCompCardGroupLabel } from "./comp-card-sources";

const CATALOG = {
  "context-best-fit": {
    en: "Best Fit / Contexts",
    es: "Mejor Uso / Contexto",
  },
  "operational-requirements": {
    en: "Operational Requirements",
    es: "Requisitos Operativos",
  },
  "certifications-documents": {
    en: "Certifications / Documents",
    es: "Certificaciones / Documentos",
  },
  "media-portfolio": {
    en: "Media / Portfolio",
    es: "Media / Portafolio",
  },
  "rates-booking": {
    en: "Rates / Booking Terms",
    es: "Tarifas / Condiciones",
  },
} as const;

test("resolveCompCardGroupLabel uses ES name_i18n (not slug humanize)", () => {
  for (const [slug, names] of Object.entries(CATALOG)) {
    assert.equal(
      resolveCompCardGroupLabel(slug, "es", names),
      names.es,
      slug,
    );
    // Must not be the English-only slug title Live QA saw (e.g. "Context Best Fit").
    assert.notEqual(
      resolveCompCardGroupLabel(slug, "es", names),
      slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim(),
    );
  }
});

test("resolveCompCardGroupLabel uses EN name_i18n on /en", () => {
  assert.equal(
    resolveCompCardGroupLabel("operational-requirements", "en", CATALOG["operational-requirements"]),
    "Operational Requirements",
  );
  assert.equal(
    resolveCompCardGroupLabel("media-portfolio", "en-US", CATALOG["media-portfolio"]),
    "Media / Portfolio",
  );
});

test("resolveCompCardGroupLabel falls back to curated / slug when catalog empty", () => {
  assert.equal(resolveCompCardGroupLabel("physical", "es", null), "Físico");
  assert.equal(resolveCompCardGroupLabel("physical", "en", {}), "Physical");
  assert.equal(
    resolveCompCardGroupLabel("context-best-fit", "es", null),
    "Context Best Fit",
  );
  assert.equal(resolveCompCardGroupLabel(null, "es"), "Detalles");
});
