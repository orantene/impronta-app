import test from "node:test";
import assert from "node:assert/strict";
import { GALLERY_DESIGNS, searchGallery, setGalleryUnavailableSlugs, visibleGalleryDesigns } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { defaultMaisonChoices, exploreDesignPatch, parseMaisonChoices, persistableMaisonChoices } from "./maison-choices";

// TUL-747: Explorar on any gallery card opens THAT design, never Maison v2.
test("exploreDesignPatch keeps the slug of every gallery design", () => {
  assert.ok(GALLERY_DESIGNS.length > 3);
  for (const d of GALLERY_DESIGNS) {
    assert.equal(exploreDesignPatch(d.slug).designSlug, d.slug, d.slug);
  }
});

test("a saved explore choice round-trips the design slug for every gallery design", () => {
  for (const d of GALLERY_DESIGNS) {
    const saved = persistableMaisonChoices({ ...defaultMaisonChoices(), ...exploreDesignPatch(d.slug) });
    assert.equal(parseMaisonChoices(saved).designSlug, d.slug, d.slug);
  }
});

// TUL-747: a design whose catalog row is not published (Folio draft, no release) previews as 404, so the picker hides it.
test("the picker never offers a design the server reports as unreleased", () => {
  try {
    assert.ok(visibleGalleryDesigns(false).some((d) => d.slug === "folio"));
    setGalleryUnavailableSlugs(["Folio"]);
    assert.ok(!visibleGalleryDesigns(false).some((d) => d.slug === "folio"));
    assert.ok(!searchGallery({ showExtra: false }).results.some((r) => r.design.slug === "folio"));
    assert.ok(visibleGalleryDesigns(false).some((d) => d.slug === "gridline"));
  } finally {
    setGalleryUnavailableSlugs([]);
  }
  assert.ok(visibleGalleryDesigns(false).some((d) => d.slug === "folio"));
});
