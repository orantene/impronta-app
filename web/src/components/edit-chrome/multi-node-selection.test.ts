import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extendSelection,
  removeMissingSelectionIds,
  replaceSelection,
  selectedIdsFromState,
  toggleSelection,
} from "./multi-node-selection";

test("replaceSelection keeps a stable primary plus ordered additional ids", () => {
  const state = replaceSelection(["a", "b", "a", "c"]);
  assert.equal(state.primaryId, "a");
  assert.deepEqual(Array.from(state.additionalIds), ["b", "c"]);
  assert.deepEqual(selectedIdsFromState(state.primaryId, state.additionalIds), [
    "a",
    "b",
    "c",
  ]);
});

test("extendSelection promotes the first id and appends later ids", () => {
  const first = extendSelection({ primaryId: null, additionalIds: new Set() }, "a");
  const second = extendSelection(first, "b");
  assert.equal(second.primaryId, "a");
  assert.deepEqual(Array.from(second.additionalIds), ["b"]);
});

test("toggleSelection demotes primary to the next selected id", () => {
  const state = replaceSelection(["a", "b", "c"]);
  const toggled = toggleSelection(state, "a");
  assert.equal(toggled.primaryId, "b");
  assert.deepEqual(Array.from(toggled.additionalIds), ["c"]);
});

test("removeMissingSelectionIds keeps selection anchored to live ids", () => {
  const state = replaceSelection(["a", "b", "c"]);
  const cleaned = removeMissingSelectionIds(state, (id) => id !== "a");
  assert.equal(cleaned.primaryId, "b");
  assert.deepEqual(Array.from(cleaned.additionalIds), ["c"]);
});
