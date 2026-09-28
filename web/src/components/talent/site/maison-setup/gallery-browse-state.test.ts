import test from "node:test";
import assert from "node:assert/strict";

// These suites cover the full catalog; the default three-design view is
// covered in gallery-visibility.test.ts.
process.env.TALENT_GALLERY_EXTRA_DESIGNS = "1";
import { GALLERY_DESIGNS } from "@/lib/talent-site/theme-catalog/gallery-meta";
import {
  DEFAULT_GALLERY_BROWSE_STATE as D,
  deriveGalleryView,
  fill,
  gallerySearchSuggestions,
  isFilterActive,
  parseGalleryBrowseState,
  removeQueryTerm,
  resetFilters,
} from "./gallery-browse-state";

test("default view shows every gallery design, no filter active", () => {
  const v = deriveGalleryView(D);
  assert.equal(v.output.themeCount, GALLERY_DESIGNS.length);
  assert.equal(isFilterActive(D), false);
});

test("search Model: designs with model demos, Spanish synonym gives same results", () => {
  const en = deriveGalleryView({ ...D, query: "Model" });
  const es = deriveGalleryView({ ...D, query: "Modelo" });
  assert.ok(en.output.themeCount > 0);
  assert.deepEqual(
    en.output.results.map((r) => r.design.slug),
    es.output.results.map((r) => r.design.slug),
  );
  assert.equal(isFilterActive({ ...D, query: "Model" }), true);
});

test("no match gives empty results and suggestions, never throws", () => {
  const v = deriveGalleryView({ ...D, query: "Astronaut" });
  assert.equal(v.output.themeCount, 0);
  assert.ok(v.output.suggestionsWhenEmpty.length > 0);
});

test("tags filter: every selected tag must match (style + feature)", () => {
  const v = deriveGalleryView({ ...D, tags: ["Portfolio"] });
  assert.ok(v.output.results.every((r) => r.design.featureTags.includes("Portfolio")));
  const both = deriveGalleryView({ ...D, tags: ["Portfolio", "Minimal"] });
  assert.ok(both.output.results.every((r) => r.design.styleTags.includes("Minimal")));
  // counts come from results before tags
  assert.equal(v.countsBase.length, GALLERY_DESIGNS.length);
});

test("combined talents splits top (combines both) and rest, nothing removed", () => {
  const plain = deriveGalleryView({ ...D, query: "Model, Singer" });
  const comb = deriveGalleryView({ ...D, query: "Model, Singer", combined: true });
  assert.equal(comb.top.length + comb.rest.length, plain.output.themeCount);
  assert.ok(comb.top.every((r) => r.combinesBoth));
  assert.equal(plain.rest.length, 0);
});

test("removeQueryTerm and resetFilters", () => {
  assert.equal(removeQueryTerm("Model, Singer", 0), "singer");
  const r = resetFilters({ ...D, query: "x", chip: "music", style: "Bold", tags: ["Portfolio"], combined: true, lastViewed: "folio" });
  assert.equal(isFilterActive(r), false);
  assert.equal(r.lastViewed, "folio");
});

test("suggestions: profession with counts and a Spanish synonym row", () => {
  const s = gallerySearchSuggestions("Mod", "en");
  const prof = s.find((x) => x.kind === "profession" && x.label === "Model");
  assert.ok(prof && prof.demos > 0 && prof.themes > 0);
  assert.ok(s.some((x) => x.kind === "synonym" && x.label === "Modelo" && x.sameAs === "Model"));
  assert.deepEqual(gallerySearchSuggestions("m", "en"), []);
});

test("parse is fail-closed and fill replaces placeholders", () => {
  assert.deepEqual(parseGalleryBrowseState("{bad"), D);
  const p = parseGalleryBrowseState(JSON.stringify({ query: "dj", style: "Nope", scrollY: -5, tags: ["Portfolio", 3] }));
  assert.equal(p.query, "dj");
  assert.equal(p.style, null);
  assert.equal(p.scrollY, 0);
  assert.deepEqual(p.tags, ["Portfolio"]);
  assert.equal(fill("{n} demos in {m} themes", { n: 3, m: 2 }), "3 demos in 2 themes");
});
