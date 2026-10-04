/**
 * Gallery metadata: shape, palettes, search, tag counts, trade suggestions.
 */
import test from "node:test";
import assert from "node:assert/strict";

// These suites cover the full catalog; the default three-design view is
// covered in gallery-visibility.test.ts.
process.env.TALENT_GALLERY_EXTRA_DESIGNS = "1";

import { COLLECTION_DESIGNS } from "./collection/designs";
import { MAISON_PALETTES, MAISON_PALETTE_ORDER, maisonPaletteLookTokens } from "./maison/seed";
import { DEMOS } from "../../../../scripts/demo-talents/demos";
import { THEME_DEMOS } from "./theme-demos";
import {
  GALLERY_CATEGORY_CHIPS,
  GALLERY_DESIGNS,
  GALLERY_FEATURE_TAGS,
  GALLERY_STYLE_TAGS,
  galleryDefaultLookTokens,
  galleryPaletteLookTokens,
  galleryPreviewLookSlug,
  getGalleryDesign,
  professionsForTerm,
  searchGallery,
  suggestedDesignsForTrade,
  tagCounts,
} from "./gallery-meta";

const slugs = (o: ReturnType<typeof searchGallery>) => o.results.map((r) => r.design.slug);

test("covers maison + every collection design, with their names", () => {
  assert.deepEqual(
    GALLERY_DESIGNS.map((d) => d.slug),
    ["maison", ...COLLECTION_DESIGNS.map((d) => d.slug)],
  );
  for (const c of COLLECTION_DESIGNS) assert.equal(getGalleryDesign(c.slug)?.name, c.title);
});

test("every design is well formed", () => {
  for (const d of GALLERY_DESIGNS) {
    assert.ok(d.description.en && d.description.es, d.slug);
    assert.ok(!/—/.test(d.description.en + d.description.es), `em dash in ${d.slug}`);
    for (const t of d.styleTags) assert.ok(GALLERY_STYLE_TAGS.includes(t));
    for (const t of d.featureTags) assert.ok(GALLERY_FEATURE_TAGS.includes(t));
    for (const c of d.categoryChips) assert.ok(GALLERY_CATEGORY_CHIPS.includes(c));
    // Maison v2 has six since release 2.5 (Orchid joined the five; none were retired).
    assert.ok(d.palettes.length >= 3 && d.palettes.length <= (d.slug === "maison-v2" ? 6 : 5), d.slug);
    assert.ok(d.palettes.some((p) => p.highContrast), `${d.slug} needs a high-contrast palette`);
    const keys = new Set(d.palettes.map((p) => p.key));
    assert.equal(keys.size, d.palettes.length);
    for (const demo of d.demos) {
      assert.ok(keys.has(demo.defaultPalette), `${d.slug}/${demo.key} palette`);
      if (demo.status === "built") assert.notEqual(demo.source.kind, "none");
      else assert.equal(demo.source.kind, "none");
    }
    assert.equal(new Set(d.demos.map((x) => x.key)).size, d.demos.length);
  }
});

test("maison keeps its five palettes exactly", () => {
  const m = getGalleryDesign("maison")!;
  assert.deepEqual(
    m.palettes.map((p) => p.name.en),
    ["Pink & Lipstick", "Pearl & Ink", "Lilac & Plum", "Sand & Espresso", "Peach & Terracotta"],
  );
  for (const k of MAISON_PALETTE_ORDER) {
    assert.deepEqual(galleryPaletteLookTokens("maison", k), maisonPaletteLookTokens(k));
    assert.equal(m.palettes.find((p) => p.key === k)?.accent, MAISON_PALETTES[k].accent);
  }
});

test("collection palettes cover maison's token keys, plus muted/on-accent and design fonts", () => {
  const keys = Object.keys(maisonPaletteLookTokens("pink")).sort();
  for (const d of GALLERY_DESIGNS) {
    for (const p of d.palettes) {
      const got = Object.keys(galleryPaletteLookTokens(d.slug, p.key)!);
      for (const k of keys) assert.ok(got.includes(k), `${d.slug}/${p.key} ${k}`);
    }
  }
  const rose = galleryPaletteLookTokens("maison-v2", "rose")!;
  assert.equal(rose["color.background"], "#FCF7F7");
  assert.equal(rose["color.primary"], "#B3174A");
  assert.equal(rose["color.muted"], "#7B6468");
  assert.match(rose["typography.heading-font-family"]!, /Bodoni Moda/);
  assert.match(rose["typography.body-font-family"]!, /Figtree/);
  assert.equal(galleryPaletteLookTokens("solace", "nope"), null);
  // Each design previews in its OWN default look, never another design's.
  const v2 = getGalleryDesign("maison-v2")!;
  assert.equal(galleryPreviewLookSlug(v2, null), "rose");
  assert.equal(galleryPreviewLookSlug(v2, "pink"), "rose", "a Maison key is not a v2 palette");
  assert.equal(galleryPreviewLookSlug(v2, "sage"), "sage");
  assert.equal(galleryPreviewLookSlug(getGalleryDesign("maison")!, "pink"), "maison-pink");
  assert.equal(galleryPreviewLookSlug(getGalleryDesign("folio")!, null), "stone");
  assert.equal(galleryDefaultLookTokens("maison-v2")!["color.background"], "#FCF7F7");
  assert.equal(galleryDefaultLookTokens("maison"), null, "Maison uses its Look rows");
  assert.equal(galleryDefaultLookTokens("folio")!["color.background"], "#ECEAE5");
  assert.equal(galleryPaletteLookTokens("nope", "pink"), null);
});

test("built talent demos point at real demo-talent packs on that design", () => {
  for (const d of GALLERY_DESIGNS) {
    for (const demo of d.demos) {
      if (demo.source.kind !== "demo-talent") continue;
      const code = demo.source.profileCode;
      // Either a hand-built pack (demos.ts) or a guide demo (theme-demos.ts).
      const pack = DEMOS.find((x) => x.profileCode === code);
      const guide = THEME_DEMOS.find((x) => x.profileCode === code);
      assert.ok(pack || guide, code);
      if (guide) {
        assert.equal(guide.siteSlug, demo.source.siteSlug);
        assert.equal(guide.design, d.slug);
      } else {
        assert.equal(pack!.siteSlug, demo.source.siteSlug);
        assert.equal(pack!.theme, d.slug);
      }
    }
  }
});

test("EN + ES synonyms resolve", () => {
  assert.deepEqual(professionsForTerm("Modelo"), ["model"]);
  assert.deepEqual(professionsForTerm("cantante"), ["singer"]);
  assert.deepEqual(professionsForTerm("uñas"), ["nails"]);
  assert.deepEqual(professionsForTerm("pestañas"), ["lashes"]);
  assert.ok(professionsForTerm("cocinero").includes("chef"));
  assert.ok(professionsForTerm("chef").includes("chef"));
  assert.deepEqual(professionsForTerm("entrenador"), ["trainer"]);
  assert.ok(professionsForTerm("fotógrafo").includes("photographer"));
});

test("no query returns all designs and usable demos only", () => {
  const out = searchGallery();
  assert.equal(out.themeCount, GALLERY_DESIGNS.length);
  assert.equal(
    out.demoCount,
    GALLERY_DESIGNS.reduce((n, d) => n + d.demos.filter((x) => x.status === "built").length, 0),
  );
  assert.deepEqual(out.suggestionsWhenEmpty, []);
});

test("search by profession finds designs and matching demos", () => {
  const out = searchGallery({ query: "Modelo" });
  assert.deepEqual(slugs(out), ["maison", "folio"]);
  const folio = out.results.find((r) => r.design.slug === "folio")!;
  assert.equal(folio.featuredDemo?.key, "fashion-model");
  assert.ok(folio.matchingDemos.every((d) => d.professions.includes("model")));
});

test("search by theme name returns that design with all demos", () => {
  const out = searchGallery({ query: "solace" });
  assert.deepEqual(slugs(out), ["solace"]);
  assert.equal(out.results[0]!.matchingDemos.length, getGalleryDesign("solace")!.demos.length);
});

test("several professions OR together; combined only reorders", () => {
  const plain = searchGallery({ query: "model, singer" });
  const combined = searchGallery({ query: "model, singer", combined: true });
  assert.deepEqual([...slugs(plain)].sort(), [...slugs(combined)].sort());
  assert.equal(combined.results[0]!.design.slug, "folio");
  assert.equal(combined.results[0]!.combinesBoth, true);
  assert.ok(plain.results.some((r) => !r.combinesBoth));
  assert.equal(searchGallery({ query: "modelo y cantante" }).results.find((r) => r.design.slug === "folio")?.combinesBoth, true);
});

test("filters: chips, style (any), features (all)", () => {
  assert.deepEqual(slugs(searchGallery({ chips: ["wellness"] })), ["solace"]);
  assert.ok(slugs(searchGallery({ styleTags: ["Dark"] })).length === 0);
  const f = searchGallery({ featureTags: ["Portfolio", "Project stories"] });
  assert.deepEqual(slugs(f), ["folio"]);
});

test("empty result offers suggestions mapped to real professions", () => {
  const out = searchGallery({ query: "astronaut" });
  assert.equal(out.themeCount, 0);
  assert.deepEqual(out.suggestionsWhenEmpty.map((s) => s.label.en), ["Speaker", "Teacher", "Guide"]);
  for (const s of out.suggestionsWhenEmpty) assert.ok(searchGallery({ query: s.profession }).themeCount > 0);
});

test("tagCounts counts designs per tag", () => {
  const c = tagCounts(searchGallery().results);
  assert.equal(c.styleTags.Editorial, GALLERY_DESIGNS.filter((d) => d.styleTags.includes("Editorial")).length);
  assert.equal(c.featureTags.Portfolio, 3);
  assert.equal(c.styleTags.Dark, 0);
});

test("suggestedDesignsForTrade", () => {
  assert.deepEqual(suggestedDesignsForTrade("Lash Artist"), ["maison", "maison-v2"]);
  assert.deepEqual(suggestedDesignsForTrade("beauty"), ["maison", "maison-v2"]);
  assert.equal(suggestedDesignsForTrade("Fashion Model")[0], "folio");
  assert.equal(suggestedDesignsForTrade("Masajista")[0], "solace");
  assert.equal(suggestedDesignsForTrade("wellness")[0], "solace");
  assert.equal(suggestedDesignsForTrade("Personal Trainer")[0], "mono");
  assert.deepEqual(suggestedDesignsForTrade(""), []);
  assert.deepEqual(suggestedDesignsForTrade("zzz"), []);
  for (const t of ["Nail Artist", "Chef", "DJ", "Fotógrafo"]) assert.ok(suggestedDesignsForTrade(t).length <= 2);
});
