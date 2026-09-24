/**
 * registry.test.ts — a search must never surface a Recommended alias
 * alongside the real item it aliases.
 *
 * `ADD_GALLERY_ITEMS` carries both `sec-hero-centered` and a shallow-copied
 * `rec:sec-hero-centered` (same label/description, category "recommended"),
 * so a query would otherwise return both as separate cards once the search
 * path drops the category filter.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ADD_GALLERY_ITEMS, filterGalleryItemsFrom } from "./registry";

test("a query never returns a rec: alias alongside its real item", () => {
  const aliases = ADD_GALLERY_ITEMS.filter((item) => item.id.startsWith("rec:"));
  assert.ok(aliases.length > 0, "no rec: aliases found — is the fixture stale?");

  for (const alias of aliases) {
    const realId = alias.id.slice("rec:".length);
    const real = ADD_GALLERY_ITEMS.find((item) => item.id === realId);
    assert.ok(real, `${realId} should exist alongside its alias ${alias.id}`);

    const query = real.label.split(/\s+/)[0]!.toLowerCase();
    const results = filterGalleryItemsFrom(ADD_GALLERY_ITEMS, {
      tab: real.tab,
      query,
    });

    assert.ok(
      results.some((r) => r.id === realId),
      `searching "${query}" should still return the real item ${realId}`,
    );
    assert.ok(
      !results.some((r) => r.id === alias.id),
      `searching "${query}" returned the rec: alias ${alias.id} as a duplicate card`,
    );
  }
});

test("the Recommended rail is untouched when there is no search query", () => {
  const results = filterGalleryItemsFrom(ADD_GALLERY_ITEMS, {
    tab: "designs",
    categoryId: "recommended",
  });
  assert.ok(results.length > 0, "the Recommended category should not be empty");
  assert.ok(
    results.every((item) => item.id.startsWith("rec:")),
    "every card in the Recommended category should be a rec: alias",
  );
});
