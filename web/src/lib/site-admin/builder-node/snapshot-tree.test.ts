import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSnapshotBuilderTree,
  resolveSnapshotBuilderTreeForPublish,
  type SnapshotWithBuilderTree,
} from "./snapshot-tree";
import type { BuilderNodeTree } from "./types";

// Regression for the agency-homepage edit-mode crash:
// "Cannot read properties of undefined (reading 'some')". An edit-mode draft
// snapshot is built from a pure builderTree and can arrive with `slots`
// undefined even though HomepageSnapshot types it required. The resolver and the
// publish path must normalize it to [] instead of throwing on `slots.some(...)`.

const validTree: BuilderNodeTree = [
  {
    id: "section-1",
    kind: "section",
    props: { sectionId: "section-1", sectionTypeKey: "hero" },
    children: [
      { id: "heading-1", kind: "heading", props: { text: "Headline", level: 2 } },
    ],
  },
];

test("resolveSnapshotBuilderTree tolerates undefined slots with a builderTree", () => {
  // slots omitted entirely — the exact runtime shape that crashed.
  const snapshot = { builderTree: validTree } as unknown as SnapshotWithBuilderTree;
  let tree: BuilderNodeTree | undefined;
  assert.doesNotThrow(() => {
    tree = resolveSnapshotBuilderTree(snapshot).tree;
  });
  assert.ok(Array.isArray(tree));
});

test("resolveSnapshotBuilderTree tolerates undefined slots with no builderTree", () => {
  const snapshot = {} as unknown as SnapshotWithBuilderTree;
  assert.doesNotThrow(() => resolveSnapshotBuilderTree(snapshot));
});

test("resolveSnapshotBuilderTreeForPublish tolerates undefined slots", () => {
  const snapshot = { builderTree: validTree } as unknown as SnapshotWithBuilderTree;
  assert.doesNotThrow(() => resolveSnapshotBuilderTreeForPublish(snapshot));
});
