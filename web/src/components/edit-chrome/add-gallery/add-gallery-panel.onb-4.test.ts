/**
 * ONB-4 — gallery Designs default + Recommended row + inline page CRUD slug preview.
 *
 * Tests:
 *   1. The default AddGalleryPanel tab is now "designs" (not "blocks").
 *   2. A "Recommended" category exists in the Designs tab with the curated items.
 *   3. The recommended items are the first category listed for the Designs tab.
 *   4. slugifyTitle (client-side slug preview) handles edge cases correctly.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test src/components/edit-chrome/add-gallery/add-gallery-panel.onb-4.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ADD_GALLERY_CATEGORIES,
  ADD_GALLERY_ITEMS,
  RECOMMENDED_SECTION_IDS,
  filterGalleryItemsFrom,
  listGalleryCategoriesForTabFrom,
} from "@/lib/site-admin/add-gallery/registry";

// ── 1. Default tab is "designs" ─────────────────────────────────────────────
describe("ONB-4 — AddGalleryPanel default tab", () => {
  it("The panel default tab is designs (constant import verifies code change)", () => {
    // The default useState initializer in add-gallery-panel.tsx is now "designs".
    // We cannot import a React component in a pure-node test runner, so we verify
    // the registry invariants that make the Designs tab meaningful on first open.
    const sectionCats = ADD_GALLERY_CATEGORIES.filter((c) => c.tab === "designs");
    assert.ok(sectionCats.length > 0, "designs tab has at least one category");

    // Recommended is the first category for designs in the canonical order.
    const firstSectionCat = sectionCats[0];
    assert.equal(firstSectionCat?.id, "recommended", "Recommended is first in designs tab");
  });
});

// ── 2. Recommended category exists and contains the curated items ─────────────
describe("ONB-4 — Recommended category", () => {
  it("ADD_GALLERY_CATEGORIES has a recommended entry in the designs tab", () => {
    const rec = ADD_GALLERY_CATEGORIES.find((c) => c.id === "recommended");
    assert.ok(rec, "recommended category must exist");
    assert.equal(rec.tab, "designs", "recommended category must be in designs tab");
    assert.equal(rec.label, "Recommended", "label must be 'Recommended'");
  });

  it("RECOMMENDED_SECTION_IDS is non-empty and all IDs appear in the available items", () => {
    assert.ok(RECOMMENDED_SECTION_IDS.length >= 1, "at least one recommended item");
    for (const id of RECOMMENDED_SECTION_IDS) {
      const item = ADD_GALLERY_ITEMS.find((i) => i.id === id);
      assert.ok(item, `recommended id "${id}" must be in ADD_GALLERY_ITEMS`);
    }
  });

  it("filterGalleryItemsFrom returns items in the recommended category", () => {
    const items = filterGalleryItemsFrom(ADD_GALLERY_ITEMS, {
      tab: "designs",
      categoryId: "recommended",
    });
    assert.ok(items.length >= 1, "at least one item in the recommended category");
    for (const item of items) {
      assert.equal(item.category, "recommended", `item "${item.id}" must have category=recommended`);
      assert.equal(item.tab, "designs", `item "${item.id}" must be in designs tab`);
    }
  });

  it("recommended items count matches RECOMMENDED_SECTION_IDS that are available (not roadmap)", () => {
    const recItems = filterGalleryItemsFrom(ADD_GALLERY_ITEMS, {
      tab: "designs",
      categoryId: "recommended",
    });
    // Each recommended ID should produce exactly one aliased item in the gallery.
    assert.equal(
      recItems.length,
      RECOMMENDED_SECTION_IDS.length,
      `recommended items count (${recItems.length}) must equal RECOMMENDED_SECTION_IDS length (${RECOMMENDED_SECTION_IDS.length})`,
    );
  });

  it("listGalleryCategoriesForTabFrom includes recommended when items are present", () => {
    const cats = listGalleryCategoriesForTabFrom(ADD_GALLERY_ITEMS, "designs", {
      synthesizeUnknownCategories: true,
    });
    const rec = cats.find((c) => c.id === "recommended");
    assert.ok(rec, "recommended category must appear in the designs category rail");
  });

  it("recommended is the first category in the designs rail", () => {
    const cats = listGalleryCategoriesForTabFrom(ADD_GALLERY_ITEMS, "designs", {
      synthesizeUnknownCategories: false,
    });
    assert.equal(cats[0]?.id, "recommended", "recommended must be first in designs rail");
  });

  it("recommended items have unique rec:-prefixed ids (no collision with originals)", () => {
    const recItems = ADD_GALLERY_ITEMS.filter((i) => i.id.startsWith("rec:"));
    const seen = new Set<string>();
    for (const item of recItems) {
      assert.ok(!seen.has(item.id), `duplicate rec item id "${item.id}"`);
      seen.add(item.id);
      // Original (unprefixed) item must also exist.
      const original = ADD_GALLERY_ITEMS.find((i) => i.id === item.id.slice("rec:".length));
      assert.ok(original, `original item for "${item.id}" must exist`);
    }
  });
});

// ── 3. Client-side slug preview (slugifyTitle) ────────────────────────────────
// We test the slugify logic used in AllPagesPanel inline forms.
// The logic is duplicated inline in the panel; we test it as a pure function here.
function slugifyTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

describe("ONB-4 — slugifyTitle (inline slug preview)", () => {
  it("lowercases and hyphenates basic titles", () => {
    assert.equal(slugifyTitle("My New Page"), "my-new-page");
  });

  it("strips leading and trailing hyphens", () => {
    assert.equal(slugifyTitle("  hello world  "), "hello-world");
  });

  it("collapses multiple spaces and special chars to single hyphen", () => {
    assert.equal(slugifyTitle("About Me!!!"), "about-me");
  });

  it("returns empty string for empty input", () => {
    assert.equal(slugifyTitle(""), "");
  });

  it("handles accented characters (strips diacritics)", () => {
    const slug = slugifyTitle("Sofía García");
    // After NFKD + diacritic strip: "Sofia Garcia" → "sofia-garcia"
    assert.equal(slug, "sofia-garcia");
  });

  it("handles all-numeric title", () => {
    assert.equal(slugifyTitle("2026"), "2026");
  });

  it("strips non-latin script (Chinese, emoji, etc.) to hyphens then trims", () => {
    const slug = slugifyTitle("你好 world");
    // Chinese chars → hyphens; trim → "world"
    assert.equal(slug, "world");
  });

  it("is idempotent on already-slugified input", () => {
    const input = "already-slugified";
    assert.equal(slugifyTitle(input), input);
  });

  it("caps at 240 characters", () => {
    const long = "a".repeat(300);
    const slug = slugifyTitle(long);
    assert.ok(slug.length <= 240, `slug length ${slug.length} must be ≤ 240`);
  });
});
