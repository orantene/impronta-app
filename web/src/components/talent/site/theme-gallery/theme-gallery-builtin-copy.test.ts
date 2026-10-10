/**
 * TUL-324: ManagerThemeGallery collection Design cards must show ES summaries
 * for Spanish talents (not the English catalog row).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { COLLECTION_DESIGN_SUMMARY_ES } from "@/lib/talent-site/theme-catalog/collection/design-summaries-es";

import { themeGalleryEntrySummary, themeGalleryEntryTitle } from "./theme-gallery-builtin-copy";
import type { GalleryCatalogEntry } from "./types";

function design(slug: string, title: string, summary: string): GalleryCatalogEntry {
  return {
    kind: "design",
    slug,
    title,
    summary,
    category: "editorial",
    tags: [],
    forDesign: null,
    preview: {},
    requiredTier: "talent_basic",
    version: 1,
    sortOrder: 0,
    isNew: false,
    locked: false,
  };
}

test("legacy builtin slugs still localize for es", () => {
  const entry = design(
    "default",
    "Tulala Default",
    "Our most complete design: split cover with your photo.",
  );
  assert.equal(themeGalleryEntryTitle("es", entry), "Tulala Predeterminado");
  assert.match(themeGalleryEntrySummary("es", entry), /diseño más completo/);
  assert.equal(themeGalleryEntryTitle("en", entry), "Tulala Default");
  assert.equal(themeGalleryEntrySummary("en", entry), entry.summary);
});

test("collection design summaries use COLLECTION_DESIGN_SUMMARY_ES for es", () => {
  const slugs = Object.keys(COLLECTION_DESIGN_SUMMARY_ES);
  assert.ok(slugs.length >= 6, "expected the full collection set");
  for (const slug of slugs) {
    const enSummary = `English summary for ${slug}`;
    const title = slug === "maison-v2" ? "Maison v2" : slug[0]!.toUpperCase() + slug.slice(1);
    const entry = design(slug, title, enSummary);
    assert.equal(themeGalleryEntrySummary("es", entry), COLLECTION_DESIGN_SUMMARY_ES[slug]);
    assert.equal(themeGalleryEntrySummary("en", entry), enSummary);
    // Product titles stay as cataloged (no Spanish title override).
    assert.equal(themeGalleryEntryTitle("es", entry), entry.title);
  }
});

test("unknown design slug falls back to stored English copy", () => {
  const entry = design("custom-authored", "My Look", "Authored summary");
  assert.equal(themeGalleryEntrySummary("es", entry), "Authored summary");
  assert.equal(themeGalleryEntryTitle("es", entry), "My Look");
});
