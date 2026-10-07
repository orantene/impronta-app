import assert from "node:assert/strict";
import { test } from "node:test";

import { ES_TEXT } from "@/components/edit-chrome/editor-i18n-es";
import { buildAddGallerySectionTemplate } from "./section-templates";
import { searchSections } from "./section-search";
import { templateCopySiteKind, type TemplateCopyContext } from "./section-template-copy";

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

const tr = (en: string) => ES_TEXT[en] ?? en;
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
