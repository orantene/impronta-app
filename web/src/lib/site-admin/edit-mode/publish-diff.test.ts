import assert from "node:assert/strict";
import { test } from "node:test";

import { diffPublishedRows } from "./publish-diff";

test("diffPublishedRows marks all draft rows as added when no live rows exist", () => {
  const result = diffPublishedRows(
    [
      { sectionId: "a", slotKey: "main", sortOrder: 0 },
      { sectionId: "b", slotKey: "main", sortOrder: 1 },
    ],
    [],
  );
  assert.deepEqual(result.summary, {
    added: 2,
    removed: 0,
    moved: 0,
    total: 2,
  });
  assert.deepEqual(result.removedSectionIds, []);
  assert.equal(result.draftSectionChanges.get("a"), "added");
  assert.equal(result.draftSectionChanges.get("b"), "added");
});

test("diffPublishedRows marks rows as moved when slot or order changed", () => {
  const result = diffPublishedRows(
    [
      { sectionId: "a", slotKey: "main", sortOrder: 1 },
      { sectionId: "b", slotKey: "sidebar", sortOrder: 0 },
    ],
    [
      { sectionId: "a", slotKey: "main", sortOrder: 0 },
      { sectionId: "b", slotKey: "main", sortOrder: 0 },
    ],
  );
  assert.deepEqual(result.summary, {
    added: 0,
    removed: 0,
    moved: 2,
    total: 2,
  });
  assert.deepEqual(result.removedSectionIds, []);
  assert.equal(result.draftSectionChanges.get("a"), "moved");
  assert.equal(result.draftSectionChanges.get("b"), "moved");
});

test("diffPublishedRows tracks removed live rows and unchanged draft rows", () => {
  const result = diffPublishedRows(
    [{ sectionId: "a", slotKey: "main", sortOrder: 0 }],
    [
      { sectionId: "a", slotKey: "main", sortOrder: 0 },
      { sectionId: "old", slotKey: "legacy", sortOrder: 4 },
    ],
  );
  assert.deepEqual(result.summary, {
    added: 0,
    removed: 1,
    moved: 0,
    total: 1,
  });
  assert.deepEqual(result.removedSectionIds, ["old"]);
  assert.equal(result.draftSectionChanges.get("a"), "unchanged");
});

// ── W1-L2 — builder-tree (freeform) publish diff ────────────────────────────

import { diffBuilderTreesForPublish } from "./publish-diff";

const node = (id: string, extra?: Record<string, unknown>) => ({
  id,
  kind: "container",
  ...extra,
});

test("diffBuilderTreesForPublish: identical trees report zero changes", () => {
  const tree = [node("a"), node("b")];
  const result = diffBuilderTreesForPublish(tree, [node("a"), node("b")]);
  assert.deepEqual(result.summary, { added: 0, removed: 0, moved: 0, total: 0 });
  assert.equal(result.changed, 0);
});

test("diffBuilderTreesForPublish: a new top-level layer counts as added", () => {
  const result = diffBuilderTreesForPublish(
    [node("a"), node("hero")],
    [node("a")],
  );
  assert.deepEqual(result.summary, { added: 1, removed: 0, moved: 0, total: 1 });
});

test("diffBuilderTreesForPublish: a deleted top-level layer counts as removed", () => {
  const result = diffBuilderTreesForPublish([node("a")], [node("a"), node("b")]);
  assert.deepEqual(result.summary, { added: 0, removed: 1, moved: 0, total: 1 });
});

test("diffBuilderTreesForPublish: an edited subtree (same id, same position) counts as one change", () => {
  // The 2-section repro from the W1-L2 audit: a 2-layer page with an edit used
  // to show "0 changes since last publish" because only slot rows were diffed.
  const result = diffBuilderTreesForPublish(
    [node("a", { props: { text: "EDITED" } }), node("b")],
    [node("a", { props: { text: "original" } }), node("b")],
  );
  assert.equal(result.changed, 1);
  assert.deepEqual(result.summary, { added: 0, removed: 0, moved: 1, total: 1 });
});

test("diffBuilderTreesForPublish: reordered layers count as moved", () => {
  const result = diffBuilderTreesForPublish(
    [node("b"), node("a")],
    [node("a"), node("b")],
  );
  assert.deepEqual(result.summary, { added: 0, removed: 0, moved: 2, total: 2 });
});

test("diffBuilderTreesForPublish: draft vs EMPTY published tree marks everything added", () => {
  const result = diffBuilderTreesForPublish([node("a"), node("b")], []);
  assert.deepEqual(result.summary, { added: 2, removed: 0, moved: 0, total: 2 });
});

// ── W1-L2 — publish drawer "N sections ready" counter ───────────────────────

import { effectiveSectionsReadyCount } from "./publish-diff";

test("effectiveSectionsReadyCount: curated pages count their slot rows", () => {
  assert.equal(effectiveSectionsReadyCount(4, 9), 4);
});

test("effectiveSectionsReadyCount: freeform pages (0 slot rows) count top-level tree layers — the '0 sections ready' audit defect", () => {
  // The audit's 2-section freeform page: slots 0, tree layers 2 → must say 2.
  assert.equal(effectiveSectionsReadyCount(0, 2), 2);
});

test("effectiveSectionsReadyCount: a genuinely empty page is honestly 0", () => {
  assert.equal(effectiveSectionsReadyCount(0, 0), 0);
});
