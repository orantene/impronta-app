import assert from "node:assert/strict";
import { test } from "node:test";

import { flattenTree, collectDescendantIds } from "./freeform-layers-tree";
import { removeBuilderNode } from "@/lib/site-admin/builder-node/operations";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/**
 * Equivalence guard for the bottom-up `descendantsByNode` optimization in
 * flattenTree. The map it now builds in a single pass must EXACTLY match calling
 * the naive `collectDescendantIds(node)` per node (the previous O(n²) reference).
 * `descendantsByNode` gates the layers-tree drag-drop cycle check (you can't drop
 * a node into one of its own descendants), so any drift here = tree corruption.
 */

function n(id: string, children?: BuilderNode[]): BuilderNode {
  return {
    id,
    kind: "container",
    props: {},
    children: children ?? [],
  } as unknown as BuilderNode;
}

function allNodes(tree: BuilderNodeTree): BuilderNode[] {
  const out: BuilderNode[] = [];
  const visit = (node: BuilderNode) => {
    out.push(node);
    if ("children" in node && Array.isArray(node.children)) node.children.forEach(visit);
  };
  tree.forEach(visit);
  return out;
}

// Multi-root shapes (length ≥ 2) so the single-container-root HOISTING path
// never fires and every node is walked → present in descendantsByNode.
const TREES: BuilderNodeTree[] = [
  [n("a", [n("a1"), n("a2"), n("a3")]), n("z")], // wide
  [n("r", [n("r1", [n("r1a", [n("r1a1")])])]), n("z")], // deep chain
  [n("s", [n("s1", [n("s1a"), n("s1b")]), n("s2")]), n("t")], // mixed nesting
  [n("leaf"), n("leaf2")], // leaves only
];

test("flattenTree descendantsByNode === collectDescendantIds per node (no drag-drop drift)", () => {
  for (const tree of TREES) {
    const { descendantsByNode } = flattenTree(tree);
    for (const node of allNodes(tree)) {
      const got = descendantsByNode.get(node.id);
      assert.ok(got, `missing descendants for ${node.id}`);
      assert.deepEqual(
        [...(got ?? [])].sort(),
        [...collectDescendantIds(node)].sort(),
        `descendants mismatch for ${node.id}`,
      );
    }
  }
});

test("flattenTree emits exactly one row per node in document order", () => {
  const { rows } = flattenTree(TREES[2]!);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["s", "s1", "s1a", "s1b", "s2", "t"],
  );
});

// W1-L1 regression — the P0 "delete unwraps children" defect. `flattenTree`
// used to HOIST a single container root's children to depth 0 (hiding the
// wrapper row). Because that hoist was keyed on `tree.length === 1`, it flipped
// on whenever a delete collapsed a multi-root page down to one container root,
// so the survivor's children suddenly appeared as page-level orphans. Depth is
// now a stable function of true nesting: the wrapper keeps its own row and its
// children stay nested — no matter how many roots exist.
test("flattenTree does NOT hoist a lone container root's children to page level", () => {
  const tree: BuilderNodeTree = [
    n("wrapper", [n("stack-a"), n("row-a"), n("carousel-a")]),
  ];
  const { rows } = flattenTree(tree);
  // The wrapper keeps its own top-level row; its children are nested under it.
  assert.deepEqual(
    rows.map((r) => ({ id: r.id, depth: r.depth })),
    [
      { id: "wrapper", depth: 0 },
      { id: "stack-a", depth: 1 },
      { id: "row-a", depth: 1 },
      { id: "carousel-a", depth: 1 },
    ],
  );
  // Exactly one page-level (depth 0) row — no orphans.
  assert.equal(rows.filter((r) => r.depth === 0).length, 1);
});

test("deleting one root never hoists a surviving container's children (delete != unwrap)", () => {
  // Two roots: a container wrapping several blocks, plus a sibling section.
  // Schema-valid props so removeBuilderNode's post-op validation keeps them.
  const heading = (id: string, text: string): BuilderNode =>
    ({ id, kind: "heading", props: { text, level: 2 } }) as unknown as BuilderNode;
  const before: BuilderNodeTree = [
    {
      id: "wrapper",
      kind: "container",
      props: { layout: "stack", gap: "m" },
      children: [heading("stack-a", "A"), heading("row-a", "B"), heading("carousel-a", "C")],
    } as unknown as BuilderNode,
    {
      id: "sibling",
      kind: "section",
      props: {
        sectionId: "44444444-4444-4444-8444-444444444444",
        sectionTypeKey: "hero",
        slotKey: "body",
        sortOrder: 0,
      },
      children: [],
    } as unknown as BuilderNode,
  ];
  // Before the delete the wrapper already shows as its own row (2 roots).
  const beforeRows = flattenTree(before).rows;
  assert.equal(beforeRows.find((r) => r.id === "wrapper")?.depth, 0);
  assert.equal(beforeRows.find((r) => r.id === "stack-a")?.depth, 1);

  // Delete the sibling → the tree collapses to a single container root.
  const removed = removeBuilderNode({ tree: before, nodeId: "sibling" });
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.deepEqual(
    removed.tree.map((node) => node.id),
    ["wrapper"],
  );

  // After the delete the wrapper STILL owns its row and its children STILL nest
  // one level in — they were not promoted to page level. (Old code hoisted them
  // to depth 0 here, which read as "delete unwrapped the section".)
  const afterRows = flattenTree(removed.tree).rows;
  assert.deepEqual(
    afterRows.map((r) => ({ id: r.id, depth: r.depth })),
    [
      { id: "wrapper", depth: 0 },
      { id: "stack-a", depth: 1 },
      { id: "row-a", depth: 1 },
      { id: "carousel-a", depth: 1 },
    ],
  );
  assert.equal(afterRows.filter((r) => r.depth === 0).length, 1);
});
