import assert from "node:assert/strict";
import test from "node:test";

import { siblingDropGapToMoveIndex } from "./builder-node-sibling-drop";

test("same parent: dropping on self gap is noop", () => {
  const r = siblingDropGapToMoveIndex({
    dropGapIndex: 2,
    sourceSiblingIndex: 2,
    sameParent: true,
  });
  assert.equal(r.kind, "noop");
});

test("same parent: dropping immediately after self is noop", () => {
  const r = siblingDropGapToMoveIndex({
    dropGapIndex: 3,
    sourceSiblingIndex: 2,
    sameParent: true,
  });
  assert.equal(r.kind, "noop");
});

test("same parent: move down adjusts index after removal", () => {
  const r = siblingDropGapToMoveIndex({
    dropGapIndex: 4,
    sourceSiblingIndex: 2,
    sameParent: true,
  });
  assert.deepEqual(r, { kind: "move", targetSiblingIndex: 3 });
});

test("same parent: move up uses raw gap index", () => {
  const r = siblingDropGapToMoveIndex({
    dropGapIndex: 0,
    sourceSiblingIndex: 2,
    sameParent: true,
  });
  assert.deepEqual(r, { kind: "move", targetSiblingIndex: 0 });
});

test("cross parent: no removal adjustment", () => {
  const r = siblingDropGapToMoveIndex({
    dropGapIndex: 1,
    sourceSiblingIndex: 4,
    sameParent: false,
  });
  assert.deepEqual(r, { kind: "move", targetSiblingIndex: 1 });
});

test("negative target is noop", () => {
  const r = siblingDropGapToMoveIndex({
    dropGapIndex: -1,
    sourceSiblingIndex: 0,
    sameParent: false,
  });
  assert.equal(r.kind, "noop");
});
