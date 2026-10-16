/**
 * Three finished designs in the gallery (Maison v2, Folio, Gridline);
 * Solace, Mono, Frame and Maison v1 only with TALENT_GALLERY_EXTRA_DESIGNS=1.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  FINISHED_GALLERY_SLUGS,
  GALLERY_DESIGNS,
  getGalleryDesign,
  searchGallery,
  suggestedDesignsForTrade,
  tagCounts,
  visibleGalleryDesigns,
} from "./gallery-meta";

const THREE = ["maison-v2", "folio", "gridline"];

test("default gallery shows exactly the three finished designs", () => {
  delete process.env.TALENT_GALLERY_EXTRA_DESIGNS;
  delete process.env.NEXT_PUBLIC_TALENT_GALLERY_EXTRA_DESIGNS;
  assert.deepEqual([...FINISHED_GALLERY_SLUGS], THREE);
  assert.deepEqual(visibleGalleryDesigns().map((d) => d.slug), THREE);
  const out = searchGallery();
  assert.deepEqual(out.results.map((r) => r.design.slug), THREE);
  assert.equal(out.themeCount, 3);
  // Hidden designs stay in code for previews and saved sites.
  assert.equal(GALLERY_DESIGNS.length, 7);
  assert.equal(searchGallery({ query: "solace" }).themeCount, 0);
});

test("finished set is pinned to Maison v2, Folio and Gridline; Maison v1 stays reachable", () => {
  assert.deepEqual([...FINISHED_GALLERY_SLUGS].sort(), ["folio", "gridline", "maison-v2"]);
  assert.equal(FINISHED_GALLERY_SLUGS.includes("maison"), false);
  // Not in the default gallery, but in the full catalog (pinned sites, all-designs lists).
  assert.equal(visibleGalleryDesigns(false).some((d) => d.slug === "maison"), false);
  assert.equal(visibleGalleryDesigns(true).some((d) => d.slug === "maison"), true);
  assert.ok(getGalleryDesign("maison"));
});

test("flag on shows all seven designs", () => {
  process.env.TALENT_GALLERY_EXTRA_DESIGNS = "1";
  try {
    assert.equal(visibleGalleryDesigns().length, 7);
    assert.equal(searchGallery().themeCount, 7);
    assert.deepEqual(suggestedDesignsForTrade("Personal Trainer"), ["mono", "solace"]);
  } finally {
    delete process.env.TALENT_GALLERY_EXTRA_DESIGNS;
  }
  assert.equal(searchGallery({ showExtra: true }).themeCount, 7);
  assert.equal(searchGallery({ showExtra: false }).themeCount, 3);
});

test("tag counts follow the visible designs", () => {
  const counts = tagCounts(searchGallery({ showExtra: false }).results);
  assert.equal(counts.styleTags.Minimal, 1); // Gridline
  assert.equal(counts.styleTags.Editorial, 2);
});

test("trade suggestions only name visible designs", () => {
  for (const trade of ["Personal Trainer", "Masajista", "wellness", "DJ", "Chef", "Nails"]) {
    const s = suggestedDesignsForTrade(trade, false);
    assert.ok(s.length > 0, trade);
    for (const slug of s) assert.ok(THREE.includes(slug), `${trade} -> ${slug}`);
  }
});

test("each visible design features a built demo", () => {
  for (const r of searchGallery({ showExtra: false }).results) {
    assert.equal(r.featuredDemo?.status, "built", r.design.slug);
  }
  const built = (slug: string) =>
    GALLERY_DESIGNS.find((d) => d.slug === slug)!
      .demos.filter((d) => d.status === "built")
      .map((d) =>
        d.source.kind === "demo-talent" ? d.source.siteSlug : d.source.kind === "maison-seed" ? `seed:${d.source.key}` : "",
      );
  assert.deepEqual(built("maison"), ["seed:nails"]);
  // Alba (the proposal demo) is Maison v2's featured demo: first built.
  assert.deepEqual(built("maison-v2"), ["alba-nail-artist", "camila-nails", "renata-lashes", "linh-tran", "leo-haddad", "sofia-rinaldi", "marcus-bell", "terrence-coleman"]);
  assert.deepEqual(built("folio"), [
    "mateo-ferrer",
    "lucia-herrera",
    "priya-shah",
    "andre-castillo",
    "noemi-castaneda",
    "daniel-kim",
    "elena-garza-trevino",
    "rafael-hernandez-cuevas",
    "sofia-barra",
    "claudia-retratos",
    "ivan-reyes-diseno",
  ]);
});
