import assert from "node:assert/strict";
import { test } from "node:test";

import { flattenTree, collectDescendantIds } from "./freeform-layers-tree";
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
