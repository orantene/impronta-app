import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAddGallerySectionTemplate } from "./section-templates";
import { searchSections } from "./section-search";
import { buildTemplateCopyContext, resolveCopyLocale, templateCopySiteKind, type TemplateCopyContext } from "./section-template-copy";

const IDS = ["hero", "about", "about-split", "about-stats", "services", "services-list", "testimonials", "cta", "cta-split", "faq", "contact", "inquiry-cta"];
const AGENCY_WORDS = /agency|roster|scouting|leading brands|global campaign|agencia|marcas líderes/i;
const dump = (id: string, ctx: TemplateCopyContext) => JSON.stringify(buildAddGallerySectionTemplate(id, ctx));

for (const siteKind of ["talent", "business"] as const) {
  for (const locale of ["en", "es"]) {
    test(`${siteKind} + ${locale}: no agency wording in section defaults`, () => {
      for (const id of IDS) assert.ok(!AGENCY_WORDS.test(dump(id, { siteKind, locale })), `${id} leaks agency copy`);
    });
  }
  test(`${siteKind}: testimonials carry no invented reviews (TUL-124)`, () => {
    for (const locale of ["en", "es"]) {
      const out = dump("testimonials", { siteKind, locale });
      assert.ok(!/seamless|remarkable|three continents|equipo fue sencillo/i.test(out));
      assert.ok(out.includes(locale === "es" ? "reseña real" : "real review"));
    }
  });
}

test("business + es speaks as we, talent + es as I", () => {
  assert.ok(dump("about", { siteKind: "business", locale: "es" }).includes("Sobre nosotros"));
  assert.ok(dump("about", { siteKind: "talent", locale: "es" }).includes("Sobre mí"));
});

test("agency + es translates testimonials, agency + en untouched", () => {
  assert.ok(dump("testimonials", { siteKind: "agency", locale: "es" }).includes("Con la confianza de marcas líderes"));
  assert.ok(dump("testimonials", { siteKind: "agency", locale: "en" }).includes("Trusted by leading brands"));
});

test("templateCopySiteKind honours workspace type business", () => {
  assert.equal(templateCopySiteKind("cms_page", "/x/admin", "business"), "business");
  assert.equal(templateCopySiteKind("cms_page", "/x/admin", "talent"), "agency");
});

// Fixture translator injected (lib must not import components/edit-chrome).
const ES_FIXTURE: Record<string, string> = { "FAQ Accordion": "Acordeón de preguntas frecuentes" };
const tr = (en: string) => ES_FIXTURE[en] ?? en;
test("structure search finds sections by English name", () => {
  for (const q of ["testimon", "faq"]) assert.ok(searchSections(q, tr).length > 0, q);
});
test("structure search finds sections by Spanish name, accent-insensitive", () => {
  const hits = searchSections("preguntas", tr);
  assert.ok(hits.length > 0, "preguntas");
});
test("empty query returns nothing, gibberish returns nothing", () => {
  assert.equal(searchSections("", tr).length, 0);
  assert.equal(searchSections("zzzqqq", tr).length, 0);
});

// TUL-80 / Grokbot B-9: the insert context must use the workspace type and the site locale.
test("resolveCopyLocale: unpublished store (boot en) on an es site falls back to the site default", () => {
  assert.equal(resolveCopyLocale({ locale: "en", defaultLocale: "en" }, "es"), "es");
});
test("resolveCopyLocale: published store keeps the editing locale", () => {
  assert.equal(resolveCopyLocale({ locale: "en", defaultLocale: "es" }, "es"), "en");
  assert.equal(resolveCopyLocale({ locale: "es", defaultLocale: "en" }, "en"), "es");
  assert.equal(resolveCopyLocale({ locale: "en", defaultLocale: "en" }, undefined), "en");
});
test("business workspace on an es site gets business Spanish FAQ copy, no agency wording", () => {
  const ctx = buildTemplateCopyContext({
    surfaceKind: "cms_page",
    pathname: "/w/lash/admin",
    workspaceType: "business",
    active: { locale: "en", defaultLocale: "en" },
    siteDefaultLocale: "es",
  });
  assert.deepEqual(ctx, { siteKind: "business", locale: "es" });
  const out = dump("faq", ctx);
  assert.ok(!/scouting|búsqueda de talento|Travel costs/i.test(out));
  assert.ok(out.includes("Cada reserva incluye agenda"));
});

// Structure "Add block" search: accents, UI labels, and EN/ES aliases (even when
// the translated label is "testimonios" rather than "reseñas").
const ES2: Record<string, string> = {
  "Testimonials Trio": "Trío de testimonios",
  "FAQ Accordion": "Acordeón de preguntas frecuentes",
  "Gallery Grid": "Cuadrícula de galería",
};
const tr2 = (en: string) => ES2[en] ?? en;
test("structure search is accent-insensitive in both directions and matches by key", () => {
  for (const q of ["resenas", "reseñas", "acordeon", "ACORDEÓN", "testimonios", "galeria"]) {
    assert.ok(searchSections(q, tr2).length > 0, q);
  }
  assert.ok(searchSections("faq-accordion", tr2).length > 0, "by template key");
});
test("structure search matches UI-language aliases without a Spanish label hit", () => {
  const identity = (en: string) => en;
  for (const q of ["reseñas", "preguntas frecuentes", "fotos"]) {
    assert.ok(searchSections(q, identity).length > 0, q);
  }
});
