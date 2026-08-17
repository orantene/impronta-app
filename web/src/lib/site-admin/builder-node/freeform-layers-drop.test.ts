/**
 * CANVAS-5 — freeform layer-tree drop resolver math.
 *
 * Proves the flat-list hover signal maps to the SAME {parentId, index} that the
 * navigator child-row drag would produce, and that the resolved index, fed to the
 * shared `moveBuilderNode`, lands the node where the indicator promised. Also
 * covers the cycle / self / locked / illegal-kind guards.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { moveBuilderNode } from "./operations";
import { resolveFreeformLayerDrop, type FreeformDropRow } from "./freeform-layers-drop";
import type { BuilderNodeTree } from "./types";

const EMPTY = new Set<string>();

/** A container with three stacked text blocks (one flat sibling group). */
function fixtureContainer(): BuilderNodeTree {
  return [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "n-a", kind: "heading", props: { text: "A", level: 2 } },
        { id: "n-b", kind: "paragraph", props: { text: "B" } },
        { id: "n-c", kind: "paragraph", props: { text: "C" } },
      ],
    },
  ];
}

function rowFor(
  id: string,
  index: number,
  over: Partial<FreeformDropRow> = {},
): FreeformDropRow {
  return {
    id,
    kind: "paragraph",
    parentId: "wrap",
    parentKind: "container",
    parentLocked: false,
    index,
    ...over,
  };
}

test("same-parent reorder: drop on lower half of a later row moves after it", () => {
  // Drag n-a (index 0) onto the LOWER half of n-c (index 2) → gap 3.
  const result = resolveFreeformLayerDrop({
    sourceId: "n-a",
    sourceKind: "heading",
    sourceParentId: "wrap",
    sourceIndex: 0,
    descendantIds: EMPTY,
    targetRow: rowFor("n-c", 2, { kind: "paragraph" }),
    onUpperHalf: false,
  });
  assert.equal(result.kind, "move");
  if (result.kind !== "move") return;
  // gap 3, sameParent → −1 → index 2.
  assert.equal(result.targetParentId, "wrap");
  assert.equal(result.targetIndex, 2);

  const moved = moveBuilderNode({
    tree: fixtureContainer(),
    nodeId: "n-a",
    parentId: result.targetParentId,
    index: result.targetIndex,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const wrap = moved.tree.find((n) => n.id === "wrap");
  assert.equal(wrap?.kind, "container");
  if (!wrap || wrap.kind !== "container") return;
  assert.deepEqual(wrap.children.map((c) => c.id), ["n-b", "n-c", "n-a"]);
});

test("same-parent reorder: drop on upper half before the row", () => {
  // Drag n-c (index 2) onto the UPPER half of n-a (index 0) → gap 0.
  const result = resolveFreeformLayerDrop({
    sourceId: "n-c",
    sourceKind: "paragraph",
    sourceParentId: "wrap",
    sourceIndex: 2,
    descendantIds: EMPTY,
    targetRow: rowFor("n-a", 0, { kind: "heading" }),
    onUpperHalf: true,
  });
  assert.equal(result.kind, "move");
  if (result.kind !== "move") return;
  assert.equal(result.targetIndex, 0);
  const moved = moveBuilderNode({
    tree: fixtureContainer(),
    nodeId: "n-c",
    parentId: "wrap",
    index: 0,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const wrap = moved.tree.find((n) => n.id === "wrap");
  if (!wrap || wrap.kind !== "container") return;
  assert.deepEqual(wrap.children.map((c) => c.id), ["n-c", "n-a", "n-b"]);
});

test("noop: dropping a row adjacent to itself does nothing", () => {
  // Drag n-b (index 1) onto its own lower half (gap 2) → noop (gap === idx+1).
  const lower = resolveFreeformLayerDrop({
    sourceId: "n-b",
    sourceKind: "paragraph",
    sourceParentId: "wrap",
    sourceIndex: 1,
    descendantIds: EMPTY,
    targetRow: rowFor("n-b", 1),
    onUpperHalf: false,
  });
  assert.equal(lower.kind, "noop");
  // Upper half of itself (gap 1) → also noop (gap === idx).
  const upper = resolveFreeformLayerDrop({
    sourceId: "n-b",
    sourceKind: "paragraph",
    sourceParentId: "wrap",
    sourceIndex: 1,
    descendantIds: EMPTY,
    targetRow: rowFor("n-b", 1),
    onUpperHalf: true,
  });
  assert.equal(upper.kind, "noop");
});

test("cross-parent reparent: no -1 adjustment, lands at gap index", () => {
  const tree: BuilderNodeTree = [
    {
      id: "src",
      kind: "container",
      props: { layout: "stack" },
      children: [{ id: "n-a", kind: "heading", props: { text: "A", level: 2 } }],
    },
    {
      id: "dst",
      kind: "container",
      props: { layout: "stack" },
      children: [{ id: "n-x", kind: "paragraph", props: { text: "X" } }],
    },
  ];
  // Drag n-a (src, idx 0) onto the UPPER half of n-x in dst (idx 0) → gap 0.
  const result = resolveFreeformLayerDrop({
    sourceId: "n-a",
    sourceKind: "heading",
    sourceParentId: "src",
    sourceIndex: 0,
    descendantIds: EMPTY,
    targetRow: {
      id: "n-x",
      kind: "paragraph",
      parentId: "dst",
      parentKind: "container",
      parentLocked: false,
      index: 0,
    },
    onUpperHalf: true,
  });
  assert.equal(result.kind, "move");
  if (result.kind !== "move") return;
  assert.equal(result.targetParentId, "dst");
  assert.equal(result.targetIndex, 0);
  const moved = moveBuilderNode({
    tree,
    nodeId: "n-a",
    parentId: result.targetParentId,
    index: result.targetIndex,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const dst = moved.tree.find((n) => n.id === "dst");
  if (!dst || dst.kind !== "container") return;
  assert.deepEqual(dst.children.map((c) => c.id), ["n-a", "n-x"]);
});

test("blocked: cannot reparent into the dragged node's own descendant (cycle)", () => {
  // Source "outer" owns "inner"; dropping outer onto inner must be blocked.
  const result = resolveFreeformLayerDrop({
    sourceId: "outer",
    sourceKind: "container",
    sourceParentId: null,
    sourceIndex: 0,
    descendantIds: new Set(["inner", "leaf"]),
    targetRow: {
      id: "leaf",
      kind: "paragraph",
      parentId: "inner",
      parentKind: "container",
      parentLocked: false,
      index: 0,
    },
    onUpperHalf: true,
  });
  assert.equal(result.kind, "blocked");
});

test("noop: dropping a row onto itself is a noop", () => {
  const result = resolveFreeformLayerDrop({
    sourceId: "n-b",
    sourceKind: "paragraph",
    sourceParentId: "wrap",
    sourceIndex: 1,
    descendantIds: EMPTY,
    targetRow: rowFor("n-b", 1),
    onUpperHalf: false,
  });
  // self-drop short-circuits to noop before gap math.
  assert.equal(result.kind, "noop");
});

test("blocked: cannot drop into a locked parent (governance)", () => {
  const result = resolveFreeformLayerDrop({
    sourceId: "n-a",
    sourceKind: "paragraph",
    sourceParentId: "other",
    sourceIndex: 0,
    descendantIds: EMPTY,
    targetRow: rowFor("n-x", 0, { parentLocked: true }),
    onUpperHalf: true,
  });
  assert.equal(result.kind, "blocked");
});

test("blocked: child kind not allowed under the target parent", () => {
  // A `section` cannot nest under a `card` per the registry allow-list.
  const result = resolveFreeformLayerDrop({
    sourceId: "sec",
    sourceKind: "section",
    sourceParentId: null,
    sourceIndex: 0,
    descendantIds: EMPTY,
    targetRow: {
      id: "n-y",
      kind: "paragraph",
      parentId: "card-1",
      parentKind: "card",
      parentLocked: false,
      index: 0,
    },
    onUpperHalf: true,
  });
  assert.equal(result.kind, "blocked");
});

test("root drop: a root-legal kind reorders at the page root (parentId null)", () => {
  const result = resolveFreeformLayerDrop({
    sourceId: "sec-2",
    sourceKind: "section",
    sourceParentId: null,
    sourceIndex: 1,
    descendantIds: EMPTY,
    targetRow: {
      id: "sec-0",
      kind: "section",
      parentId: null,
      parentKind: null,
      parentLocked: false,
      index: 0,
    },
    onUpperHalf: true,
  });
  assert.equal(result.kind, "move");
  if (result.kind !== "move") return;
  assert.equal(result.targetParentId, null);
  assert.equal(result.targetIndex, 0);
});

// ── nest-into-container drops (zone: "inside") ───────────────────────────────
// Before this zone existed the flat layer list could only ever place a block as
// a SIBLING of a row already inside the target container, so a container the
// operator had not yet expanded — or an empty one — was unreachable from the
// Structure panel. These cover the append math and the three guards.

test("inside: dropping on a container row's middle band appends into it", () => {
  const result = resolveFreeformLayerDrop({
    sourceId: "loose",
    sourceKind: "paragraph",
    sourceParentId: null,
    sourceIndex: 4,
    descendantIds: EMPTY,
    targetRow: {
      id: "wrap",
      kind: "container",
      parentId: null,
      parentKind: null,
      parentLocked: false,
      index: 0,
      childCount: 3,
    },
    onUpperHalf: false,
    zone: "inside",
  });
  assert.equal(result.kind, "move");
  if (result.kind !== "move") return;
  assert.equal(result.targetParentId, "wrap", "the hovered row becomes the parent");
  assert.equal(result.targetIndex, 3, "appends after the existing children");
});

test("inside: a same-parent re-nest takes the post-removal end index", () => {
  // n-a is already child 0 of wrap (3 children). Re-nesting sends it to the
  // end; after its own removal the end index is 2, not 3.
  const result = resolveFreeformLayerDrop({
    sourceId: "n-a",
    sourceKind: "heading",
    sourceParentId: "wrap",
    sourceIndex: 0,
    descendantIds: EMPTY,
    targetRow: {
      id: "wrap",
      kind: "container",
      parentId: null,
      parentKind: null,
      parentLocked: false,
      index: 0,
      childCount: 3,
    },
    onUpperHalf: false,
    zone: "inside",
  });
  assert.equal(result.kind, "move");
  if (result.kind !== "move") return;
  assert.equal(result.targetIndex, 2);

  // And the resolved index actually lands it last in the real tree.
  const moved = moveBuilderNode({
    tree: fixtureContainer(),
    nodeId: "n-a",
    parentId: result.targetParentId,
    index: result.targetIndex,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const wrap = moved.tree.find((n) => n.id === "wrap");
  if (!wrap || wrap.kind !== "container") return assert.fail("wrap missing");
  assert.deepEqual(wrap.children.map((c) => c.id), ["n-b", "n-c", "n-a"]);
});

test("inside: already the last child is a no-op, not a redundant move", () => {
  const result = resolveFreeformLayerDrop({
    sourceId: "n-c",
    sourceKind: "paragraph",
    sourceParentId: "wrap",
    sourceIndex: 2,
    descendantIds: EMPTY,
    targetRow: {
      id: "wrap",
      kind: "container",
      parentId: null,
      parentKind: null,
      parentLocked: false,
      index: 0,
      childCount: 3,
    },
    onUpperHalf: false,
    zone: "inside",
  });
  assert.equal(result.kind, "noop");
});

test("inside: nesting a block into its own subtree is blocked", () => {
  const result = resolveFreeformLayerDrop({
    sourceId: "wrap",
    sourceKind: "container",
    sourceParentId: null,
    sourceIndex: 0,
    descendantIds: new Set(["inner"]),
    targetRow: {
      id: "inner",
      kind: "container",
      parentId: "wrap",
      parentKind: "container",
      parentLocked: false,
      index: 0,
      childCount: 0,
    },
    onUpperHalf: false,
    zone: "inside",
  });
  assert.equal(result.kind, "blocked");
});

test("inside: a locked container refuses the nest", () => {
  const result = resolveFreeformLayerDrop({
    sourceId: "loose",
    sourceKind: "paragraph",
    sourceParentId: null,
    sourceIndex: 4,
    descendantIds: EMPTY,
    targetRow: {
      id: "wrap",
      kind: "container",
      parentId: null,
      parentKind: null,
      parentLocked: false,
      index: 0,
      childCount: 1,
      locked: true,
    },
    onUpperHalf: false,
    zone: "inside",
  });
  assert.equal(result.kind, "blocked");
});

test("omitting the zone reproduces the original upper/lower-half behaviour", () => {
  // The additive-change guarantee: every pre-nest call site passes no zone and
  // must get exactly what it got before.
  for (const onUpperHalf of [true, false]) {
    const withoutZone = resolveFreeformLayerDrop({
      sourceId: "n-a",
      sourceKind: "heading",
      sourceParentId: "wrap",
      sourceIndex: 0,
      descendantIds: EMPTY,
      targetRow: rowFor("n-c", 2),
      onUpperHalf,
    });
    const withZone = resolveFreeformLayerDrop({
      sourceId: "n-a",
      sourceKind: "heading",
      sourceParentId: "wrap",
      sourceIndex: 0,
      descendantIds: EMPTY,
      targetRow: rowFor("n-c", 2),
      onUpperHalf,
      zone: onUpperHalf ? "before" : "after",
    });
    assert.deepEqual(withoutZone, withZone);
  }
});
