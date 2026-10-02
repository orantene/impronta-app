/**
 * F130: a block she placed "after <section>" keeps following that section when
 * a later update reorders the page, and the placement list previews the order
 * she will have after Apply.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { mergeDesignUpdate } from "./merge";
import { keyOf } from "./tree-ops";
import { built } from "./test-fixtures";
import { placementOptions } from "./talent-update/view";

const keys = (t: ReadonlyArray<{ props?: unknown }>) =>
  t.map((n) => keyOf(n as never)).filter(Boolean);

test("an added block follows the section she put it after when the update moves that section", () => {
  const base = built(1, { order: ["hero", "menu", "about", "faq"] });
  // She added gallery after About (it is in her page and in the new design, not in her base).
  const ours = built(1, { withGallery: true, order: ["hero", "menu", "about", "gallery", "faq"] });
  // The update moves About up, above the menu; gallery's DESIGN position is after the menu.
  const theirs = built(2, { withGallery: true, order: ["hero", "about", "menu", "gallery", "faq"] });
  const res = mergeDesignUpdate({ base, ours, theirs });
  assert.deepEqual(keys(res.trees.home!), ["hero", "about", "gallery", "menu", "faq"]);
});

test("a block the MERGE inserts (new in the design, not in her page) still lands at its design position", () => {
  const base = built(1, { order: ["hero", "menu", "about", "faq"] });
  const ours = built(1, { order: ["hero", "menu", "about", "faq"] });
  const theirs = built(2, { withGallery: true, order: ["hero", "menu", "gallery", "about", "faq"] });
  const res = mergeDesignUpdate({ base, ours, theirs });
  assert.deepEqual(keys(res.trees.home!), ["hero", "menu", "gallery", "about", "faq"]);
});

test("no reorder in the update: her placement is untouched", () => {
  const base = built(1, { order: ["hero", "menu", "about", "faq"] });
  const ours = built(1, { withGallery: true, order: ["hero", "menu", "about", "gallery", "faq"] });
  const theirs = built(2, { withGallery: true, order: ["hero", "menu", "about", "gallery", "faq"] });
  assert.deepEqual(keys(mergeDesignUpdate({ base, ours, theirs }).trees.home!), ["hero", "menu", "about", "gallery", "faq"]);
});

test("placement options list sections in the order she will have after Apply (only sections she has now)", () => {
  const now = built(1, { order: ["hero", "menu", "about", "faq"] }).trees.home!;
  // after Apply: about first, plus a section she does not have yet
  const after = built(2, { withGallery: true, order: ["hero", "about", "menu", "gallery", "faq"] }).trees.home!;
  // ids differ between builds: map the "after" order onto her node ids by key
  const byKey = new Map(now.map((n) => [keyOf(n), n.id] as const));
  const afterApply = after.map((n) => ({ ...n, id: byKey.get(keyOf(n)) ?? n.id }));
  const labels = placementOptions(now, afterApply).map((o) => o.afterId);
  assert.deepEqual(labels, ["hero", "about", "menu", "faq"].map((k) => byKey.get(k)));
  // without an offer reorder the list is her current order
  assert.deepEqual(placementOptions(now).map((o) => o.afterId), now.map((n) => n.id));
});
