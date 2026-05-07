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
