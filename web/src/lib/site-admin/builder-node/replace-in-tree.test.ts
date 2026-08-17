import { test } from "node:test";
import assert from "node:assert/strict";

import { replaceBuilderNodeInTree, findBuilderNodeParentIndex } from "./replace-in-tree";
import type { BuilderNode, BuilderNodeTree } from "./types";

const tree = (v: unknown): BuilderNodeTree => v as unknown as BuilderNodeTree;
const oneNode = (v: unknown): BuilderNode => v as unknown as BuilderNode;

test("replaceBuilderNodeInTree replaces a nested node and preserves untouched identity", () => {
  const t = tree([
    {
      id: "s",
      kind: "section",
      children: [
        { id: "a", kind: "heading", props: { text: "a" } },
        { id: "b", kind: "paragraph", props: { text: "b" } },
      ],
    },
  ]);
  const repl = oneNode({ id: "NEW", kind: "heading", props: { text: "new" } });
  const { tree: next, replaced } = replaceBuilderNodeInTree(t, "a", repl);
  assert.equal(replaced, true);
  const kids = (next[0] as { children: BuilderNode[] }).children;
  assert.equal((kids[0] as { id: string }).id, "NEW");
  // The untouched sibling keeps its object identity (immutable map).
  assert.equal(kids[1], (t[0] as { children: BuilderNode[] }).children[1]);
});

test("replaceBuilderNodeInTree on a missing id returns the same tree, replaced=false", () => {
  const t = tree([{ id: "s", kind: "section", children: [] }]);
  const { tree: next, replaced } = replaceBuilderNodeInTree(t, "zzz", oneNode({ id: "x", kind: "heading", props: {} }));
  assert.equal(replaced, false);
  assert.equal(next, t, "identical reference back when nothing changed");
});

test("findBuilderNodeParentIndex resolves root, nested, and missing", () => {
  const t = tree([
    {
      id: "s0",
      kind: "section",
      children: [{ id: "c0", kind: "container", children: [{ id: "n0", kind: "heading" }] }],
    },
    { id: "s1", kind: "section" },
  ]);
  // siblingCount travels with the position so a caller can tell whether a
  // "move down" is even possible without re-walking the tree (the canvas move
  // rail's arrows gate on it).
  assert.deepEqual(findBuilderNodeParentIndex(t, "s1"), {
    parentId: null,
    index: 1,
    siblingCount: 2,
  });
  assert.deepEqual(findBuilderNodeParentIndex(t, "c0"), {
    parentId: "s0",
    index: 0,
    siblingCount: 1,
  });
  assert.deepEqual(findBuilderNodeParentIndex(t, "n0"), {
    parentId: "c0",
    index: 0,
    siblingCount: 1,
  });
  assert.equal(findBuilderNodeParentIndex(t, "nope"), null);
});
