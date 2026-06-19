/**
 * slug-minting.test.ts — unit tests for the collision-safe slug/title
 * minting helpers (F1 fix).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-core/templates/slug-minting.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripCopySuffix,
  mintCopySlug,
  stripCopyTitleSuffix,
  mintCopyTitle,
  suggestDuplicateDefaults,
  isSlugTaken,
} from "./slug-minting";

// ── stripCopySuffix ────────────────────────────────────────────────────────────

describe("stripCopySuffix", () => {
  it("leaves a plain slug unchanged", () => {
    assert.equal(stripCopySuffix("editorial-dark"), "editorial-dark");
  });

  it("strips -copy", () => {
    assert.equal(stripCopySuffix("editorial-dark-copy"), "editorial-dark");
  });

  it("strips -copy-2", () => {
    assert.equal(stripCopySuffix("editorial-dark-copy-2"), "editorial-dark");
  });

  it("strips -copy-99", () => {
    assert.equal(stripCopySuffix("editorial-dark-copy-99"), "editorial-dark");
  });

  it("does not strip -copy from a mid-slug word", () => {
    // "my-copy-template" does not end in -copy, so it's unchanged
    assert.equal(stripCopySuffix("my-copy-template"), "my-copy-template");
  });

  it("strips only the trailing suffix, not inner occurrences", () => {
    assert.equal(stripCopySuffix("hero-copy-section-copy"), "hero-copy-section");
  });

  it("strips double-copy correctly (copy of a copy)", () => {
    // If someone somehow had "hero-copy-copy", strip the trailing -copy
    assert.equal(stripCopySuffix("hero-copy-copy"), "hero-copy");
  });
});

// ── mintCopySlug ───────────────────────────────────────────────────────────────

describe("mintCopySlug", () => {
  it("mints -copy when the slot is free", () => {
    const result = mintCopySlug("editorial-dark", new Set());
    assert.equal(result, "editorial-dark-copy");
  });

  it("mints -copy-2 when -copy is taken", () => {
    const taken = new Set(["editorial-dark-copy"]);
    assert.equal(mintCopySlug("editorial-dark", taken), "editorial-dark-copy-2");
  });

  it("mints -copy-3 when -copy and -copy-2 are taken", () => {
    const taken = new Set(["editorial-dark-copy", "editorial-dark-copy-2"]);
    assert.equal(mintCopySlug("editorial-dark", taken), "editorial-dark-copy-3");
  });

  it("strips existing -copy suffix before minting (duplicate of a copy)", () => {
    // Source slug already ends in -copy (first duplicate was named editorial-dark-copy)
    // Second duplicate should be editorial-dark-copy-2, not editorial-dark-copy-copy
    const taken = new Set(["editorial-dark-copy"]);
    assert.equal(mintCopySlug("editorial-dark-copy", taken), "editorial-dark-copy-2");
  });

  it("strips -copy-N suffix before minting (duplicate of a copy-N)", () => {
    const taken = new Set(["editorial-dark-copy", "editorial-dark-copy-2"]);
    assert.equal(mintCopySlug("editorial-dark-copy-2", taken), "editorial-dark-copy-3");
  });

  it("handles gaps in the numbering sequence", () => {
    // 1 and 3 taken; 2 is free
    const taken = new Set(["foo-copy", "foo-copy-3"]);
    assert.equal(mintCopySlug("foo", taken), "foo-copy-2");
  });

  it("handles whitespace in the input slug", () => {
    const result = mintCopySlug("  my-slug  ", new Set());
    assert.equal(result, "my-slug-copy");
  });

  it("simulates duplicate-three-times producing three distinct slugs", () => {
    const existing = new Set<string>();

    const first = mintCopySlug("editorial-dark", existing);
    assert.equal(first, "editorial-dark-copy");
    existing.add(first);

    const second = mintCopySlug("editorial-dark", existing);
    assert.equal(second, "editorial-dark-copy-2");
    existing.add(second);

    const third = mintCopySlug("editorial-dark", existing);
    assert.equal(third, "editorial-dark-copy-3");
    existing.add(third);

    // All three are distinct
    assert.equal(new Set([first, second, third]).size, 3);
  });

  it("simulates duplicate-source-that-is-already-a-copy", () => {
    // User duplicates "editorial-dark-copy" when "editorial-dark-copy-2" already exists.
    // Should mint "editorial-dark-copy-3".
    const existing = new Set(["editorial-dark-copy", "editorial-dark-copy-2"]);
    const result = mintCopySlug("editorial-dark-copy", existing);
    assert.equal(result, "editorial-dark-copy-3");
  });
});

// ── stripCopyTitleSuffix ───────────────────────────────────────────────────────

describe("stripCopyTitleSuffix", () => {
  it("leaves a plain title unchanged", () => {
    assert.equal(stripCopyTitleSuffix("Editorial Dark"), "Editorial Dark");
  });

  it("strips (Copy)", () => {
    assert.equal(stripCopyTitleSuffix("Editorial Dark (Copy)"), "Editorial Dark");
  });

  it("strips (Copy 2)", () => {
    assert.equal(stripCopyTitleSuffix("Editorial Dark (Copy 2)"), "Editorial Dark");
  });

  it("strips (Copy 99)", () => {
    assert.equal(stripCopyTitleSuffix("Editorial Dark (Copy 99)"), "Editorial Dark");
  });

  it("does not strip (Copy) from mid-title occurrence", () => {
    assert.equal(
      stripCopyTitleSuffix("My (Copy) Template"),
      "My (Copy) Template",
    );
  });

  it("handles extra whitespace before suffix", () => {
    // Multiple spaces before the suffix — the regex is \s+ so this collapses fine
    assert.equal(stripCopyTitleSuffix("Hero  (Copy)"), "Hero");
  });
});

// ── mintCopyTitle ──────────────────────────────────────────────────────────────

describe("mintCopyTitle", () => {
  it("mints (Copy) when the slot is free", () => {
    assert.equal(mintCopyTitle("Editorial Dark", new Set()), "Editorial Dark (Copy)");
  });

  it("mints (Copy 2) when (Copy) is taken", () => {
    const taken = new Set(["Editorial Dark (Copy)"]);
    assert.equal(mintCopyTitle("Editorial Dark", taken), "Editorial Dark (Copy 2)");
  });

  it("mints (Copy 3) when (Copy) and (Copy 2) are taken", () => {
    const taken = new Set(["Editorial Dark (Copy)", "Editorial Dark (Copy 2)"]);
    assert.equal(mintCopyTitle("Editorial Dark", taken), "Editorial Dark (Copy 3)");
  });

  it("is case-insensitive (treats copy and Copy as the same slot)", () => {
    const taken = new Set(["editorial dark (copy)"]);
    assert.equal(mintCopyTitle("Editorial Dark", taken), "Editorial Dark (Copy 2)");
  });

  it("strips existing (Copy) suffix before minting", () => {
    const taken = new Set(["Hero Section (Copy)"]);
    assert.equal(mintCopyTitle("Hero Section (Copy)", taken), "Hero Section (Copy 2)");
  });

  it("strips existing (Copy N) suffix before minting", () => {
    const taken = new Set(["Hero Section (Copy)", "Hero Section (Copy 2)"]);
    assert.equal(mintCopyTitle("Hero Section (Copy 2)", taken), "Hero Section (Copy 3)");
  });

  it("simulates title dedup for three successive duplicates", () => {
    const existing = new Set<string>();

    const first = mintCopyTitle("Gallery Hero", existing);
    assert.equal(first, "Gallery Hero (Copy)");
    existing.add(first);

    const second = mintCopyTitle("Gallery Hero", existing);
    assert.equal(second, "Gallery Hero (Copy 2)");
    existing.add(second);

    const third = mintCopyTitle("Gallery Hero", existing);
    assert.equal(third, "Gallery Hero (Copy 3)");
    existing.add(third);

    assert.equal(new Set([first, second, third]).size, 3);
  });
});

// ── suggestDuplicateDefaults ───────────────────────────────────────────────────
// A1 — these helpers power the duplicate-with-rename dialog in TemplateManager.

describe("suggestDuplicateDefaults", () => {
  it("suggests the first free copy slug and title when no copies exist", () => {
    const rows = [{ slug: "editorial-dark", title: "Editorial Dark" }];
    const result = suggestDuplicateDefaults("editorial-dark", "Editorial Dark", rows);
    assert.equal(result.slug, "editorial-dark-copy");
    assert.equal(result.title, "Editorial Dark (Copy)");
  });

  it("skips -copy and suggests -copy-2 when -copy is already taken", () => {
    const rows = [
      { slug: "editorial-dark", title: "Editorial Dark" },
      { slug: "editorial-dark-copy", title: "Editorial Dark (Copy)" },
    ];
    const result = suggestDuplicateDefaults("editorial-dark", "Editorial Dark", rows);
    assert.equal(result.slug, "editorial-dark-copy-2");
    assert.equal(result.title, "Editorial Dark (Copy 2)");
  });

  it("uses source row as base when source already has -copy suffix", () => {
    // Duplicating a copy — should not accumulate -copy-copy
    const rows = [
      { slug: "editorial-dark", title: "Editorial Dark" },
      { slug: "editorial-dark-copy", title: "Editorial Dark (Copy)" },
    ];
    const result = suggestDuplicateDefaults(
      "editorial-dark-copy",
      "Editorial Dark (Copy)",
      rows,
    );
    assert.equal(result.slug, "editorial-dark-copy-2");
    assert.equal(result.title, "Editorial Dark (Copy 2)");
  });

  it("returns distinct slug and title when both free slots differ", () => {
    // Title slot (Copy) taken but slug slot -copy is free
    const rows = [
      { slug: "hero-dark", title: "Hero Dark" },
      { slug: "hero-dark-other", title: "Hero Dark (Copy)" },
    ];
    const result = suggestDuplicateDefaults("hero-dark", "Hero Dark", rows);
    assert.equal(result.slug, "hero-dark-copy");
    assert.equal(result.title, "Hero Dark (Copy 2)");
  });
});

// ── isSlugTaken ────────────────────────────────────────────────────────────────

describe("isSlugTaken", () => {
  const rows = [
    { slug: "editorial-dark" },
    { slug: "hero-section" },
    { slug: "editorial-dark-copy" },
  ];

  it("returns true when slug is in the list", () => {
    assert.equal(isSlugTaken("editorial-dark", rows), true);
  });

  it("returns false when slug is not in the list", () => {
    assert.equal(isSlugTaken("brand-new-slug", rows), false);
  });

  it("is case-insensitive", () => {
    assert.equal(isSlugTaken("EDITORIAL-DARK", rows), true);
  });

  it("returns false for the excluded slug (pre-populated default is always valid)", () => {
    // The suggested default slug "editorial-dark-copy" is already in the list,
    // but we pass it as excludeSlug so it doesn't block submitting the default.
    assert.equal(
      isSlugTaken("editorial-dark-copy", rows, "editorial-dark-copy"),
      false,
    );
  });

  it("returns true for a different slug that happens to collide even with excludeSlug set", () => {
    // User typed "editorial-dark" while excludeSlug is "editorial-dark-copy"
    assert.equal(
      isSlugTaken("editorial-dark", rows, "editorial-dark-copy"),
      true,
    );
  });

  it("returns false for an empty list", () => {
    assert.equal(isSlugTaken("any-slug", []), false);
  });
});
