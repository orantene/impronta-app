import assert from "node:assert/strict";
import { test } from "node:test";

import { createBuilderSectionEmbed } from "@/lib/site-admin/builder-node/section-embed-presets";

import { ADD_GALLERY_ITEMS, listGalleryCategoriesForTabFrom } from "./registry";
import { buildAddGallerySectionTemplate } from "./section-templates";
import type { TemplateCopyContext } from "./section-template-copy";
import { filterGalleryItemsForSiteKind, isCategoryVisibleForSiteKind } from "./site-kind-visibility";

const ROSTER_IDS = ["featured-talent", "talent-roster"];
const hrefs = (node: unknown): string[] => {
  const out: string[] = [];
  const visit = (v: unknown, key = "") => {
    if (typeof v === "string") {
      if (key === "href") out.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => visit(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(node);
  return out;
};

// (a) roster categories are agency-only

test("sanity: the code catalog really has roster categories", () => {
  const cats = listGalleryCategoriesForTabFrom(ADD_GALLERY_ITEMS, "designs").map((c) => c.id);
  for (const id of ROSTER_IDS) assert.ok(cats.includes(id), id);
});

for (const siteKind of ["business", "talent"] as const) {
  test(`${siteKind}: Featured Talent and Talent Roster are not offered`, () => {
    const items = filterGalleryItemsForSiteKind(ADD_GALLERY_ITEMS, siteKind);
    assert.ok(items.length > 0);
    assert.ok(!items.some((i) => ROSTER_IDS.includes(i.category)));
    const cats = listGalleryCategoriesForTabFrom(items, "designs", { synthesizeUnknownCategories: true }).map((c) => c.id);
    for (const id of ROSTER_IDS) assert.ok(!cats.includes(id), id);
    assert.ok(cats.includes("hero"), "other design categories stay");
  });
}

test("agency keeps every category and gets the same array back", () => {
  assert.equal(filterGalleryItemsForSiteKind(ADD_GALLERY_ITEMS, "agency"), ADD_GALLERY_ITEMS);
  assert.ok(isCategoryVisibleForSiteKind("talent-roster", "agency"));
  assert.ok(!isCategoryVisibleForSiteKind("talent-roster", "business"));
});

// (b) registry section embeds follow site kind and language

const FAQ_AGENCY_WORDS = /talent|roster|represent|directory|scouting|brief|talento|agencia|nuestro directorio|escout/i;
const embedDump = (ctx?: TemplateCopyContext) => JSON.stringify(createBuilderSectionEmbed("faq_accordion", ctx));

for (const siteKind of ["business", "talent"] as const) {
  for (const locale of ["en", "es"]) {
    test(`faq embed on ${siteKind} + ${locale} carries no agency wording`, () => {
      assert.ok(!FAQ_AGENCY_WORDS.test(embedDump({ siteKind, locale })));
    });
  }
}

test("faq embed on business + es is Spanish", () => {
  const out = embedDump({ siteKind: "business", locale: "es" });
  assert.ok(out.includes("¿Cuánto cuesta?"));
  assert.ok(out.includes("Todo lo que necesitas saber para trabajar con nosotros."));
  assert.ok(!out.includes("How are rates determined?"));
});

test("faq embed on agency + es is translated, agency + en and no context are untouched", () => {
  assert.ok(embedDump({ siteKind: "agency", locale: "es" }).includes("¿Cómo inicio una consulta?"));
  const plain = JSON.parse(embedDump());
  const en = JSON.parse(embedDump({ siteKind: "agency", locale: "en" }));
  assert.deepEqual({ ...en, id: "" }, { ...plain, id: "" });
  assert.ok(embedDump().includes("How do I start an inquiry?"));
});

test("cta and gallery_strip embeds drop agency copy on a business", () => {
  const cta = JSON.stringify(createBuilderSectionEmbed("cta_banner", { siteKind: "business", locale: "es" }));
  assert.ok(!/talento|talent/i.test(cta));
  const strip = JSON.stringify(createBuilderSectionEmbed("gallery_strip", { siteKind: "business", locale: "es" }));
  assert.ok(!/agency|agencia/i.test(strip));
});

test("embed ids and kinds survive localisation", () => {
  const node = createBuilderSectionEmbed("faq_accordion", { siteKind: "business", locale: "es" });
  assert.equal(node.kind, "section_embed");
  assert.ok(node.id.length > 0);
  assert.equal((node.props as { sectionTypeKey: string }).sectionTypeKey, "faq_accordion");
});

// (d) hero CTA labels and links follow the site

test("business hero: no roster link, Spanish labels, own pages", () => {
  const out = buildAddGallerySectionTemplate("hero", { siteKind: "business", locale: "es" });
  const links = hrefs(out);
  assert.ok(!links.includes("/directory"), "no /directory on a business");
  assert.ok(links.includes("/servicios") && links.includes("/contacto"), links.join(","));
  const json = JSON.stringify(out);
  assert.ok(json.includes("Ver servicios") && !json.includes("Explore talent"));
});

test("business hero in English points at the business pages too", () => {
  const links = hrefs(buildAddGallerySectionTemplate("hero", { siteKind: "business", locale: "en" }));
  assert.ok(!links.includes("/directory"));
  assert.ok(links.includes("/servicios"));
});

test("agency hero keeps /directory and /contact", () => {
  for (const locale of ["en", "es"]) {
    const links = hrefs(buildAddGallerySectionTemplate("hero", { siteKind: "agency", locale }));
    assert.ok(links.includes("/directory") && links.includes("/contact"));
  }
});
