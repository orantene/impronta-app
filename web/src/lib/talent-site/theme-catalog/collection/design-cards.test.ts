import assert from "node:assert/strict";
import { test } from "node:test";

import { COLLECTION_DESIGN_CARDS, isCollectionDesignSlug } from "./design-cards";
import { COLLECTION_DESIGNS } from "./designs";

test("design cards agree with the collection entries (same order, name and summary)", () => {
  assert.deepEqual(
    COLLECTION_DESIGNS.map((d) => ({ slug: d.slug, title: d.title, summary: d.summary })),
    COLLECTION_DESIGN_CARDS.map((c) => ({ ...c })),
  );
});

test("slug check is case-insensitive and rejects unknown slugs", () => {
  assert.equal(isCollectionDesignSlug(" Frame "), true);
  assert.equal(isCollectionDesignSlug("atelier"), false);
});
