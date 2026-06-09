import assert from "node:assert/strict";
import { test } from "node:test";

import {
  insertBuilderNode,
  patchBuilderNodeProps,
  removeBuilderNode,
} from "./operations";
import type { BuilderNode, BuilderNodeTree } from "./types";

/**
 * STRUCTURAL-SHARING (copy-on-write) guard for the tree mutators.
 *
 * The canvas renderer wraps every node in `React.memo` keyed by object identity
 * (`Object.is(prevNode, nextNode)`, render.tsx). The old mutators deep-cloned
 * the whole tree on every edit → every node got a fresh identity → 100% memo
 * miss → a single text edit repainted the entire page (the #1 editor-lag
 * cause). The fix rebuilds ONLY the root→target spine and SHARES every off-path
 * subtree reference, so memo'd nodes off the edited path skip re-render.
 *
 * These tests pin the three load-bearing properties of that contract:
 *   (a) an untouched sibling subtree is reference-equal (===) across the edit,
 *   (b) the input tree is never mutated in place (deep-equals a pre-op snapshot),
 *   (c) the edited node IS a fresh reference (so its own memo correctly busts).
 */

/**
 * A two-branch page: `branch-a` holds the node we edit (deeply nested under an
 * inner container); `branch-b` is the untouched sibling whose identity must be
 * preserved end-to-end.
 */
function fixture(): BuilderNodeTree {
  return [
    {
      id: "branch-a",
      kind: "container",
      props: { layout: "stack", gap: "m" },
      children: [
        {
          id: "branch-a:inner",
          kind: "container",
          props: { layout: "stack" },
          children: [
            {
              id: "deep-target",
              kind: "heading",
              props: { text: "Original", level: 2 },
            },
          ],
        },
      ],
    },
    {
      id: "branch-b",
      kind: "container",
      props: { layout: "stack", gap: "m" },
      children: [
        { id: "branch-b:heading", kind: "heading", props: { text: "Sibling", level: 2 } },
        { id: "branch-b:paragraph", kind: "paragraph", props: { text: "Untouched" } },
      ],
    },
  ];
}

/** Walk to a node by id. */
function findNode(tree: BuilderNodeTree, id: string): BuilderNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if ("children" in node && Array.isArray(node.children)) {
      const hit = findNode(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

test("patchBuilderNodeProps: copy-on-write shares off-path subtrees, freshens only the spine", () => {
  const tree = fixture();
  const before = structuredClone(tree);
  const inputSiblingB = tree[1]!; // branch-b
  const inputBranchA = tree[0]!;
  const inputTargetParent = findNode(tree, "branch-a:inner")!;

  const result = patchBuilderNodeProps({
    tree,
    nodeId: "deep-target",
    patch: { text: "Edited" },
  });
  assert.ok(result.ok, "patch should succeed");
  const next = result.tree;

  // (a) The untouched sibling subtree keeps its ORIGINAL reference.
  assert.strictEqual(
    next[1],
    inputSiblingB,
    "off-path sibling (branch-b) must be reference-equal across the patch",
  );

  // (b) The input tree was not mutated in place.
  assert.deepEqual(tree, before, "patch must not mutate its input tree");

  // (c) The patched node IS a new reference, and so is every node on its spine.
  const patched = findNode(next, "deep-target")!;
  assert.notStrictEqual(
    patched,
    findNode(tree, "deep-target"),
    "the patched node must be a fresh reference (so its memo busts)",
  );
  assert.notStrictEqual(next[0], inputBranchA, "spine root (branch-a) must be a fresh reference");
  assert.notStrictEqual(
    findNode(next, "branch-a:inner"),
    inputTargetParent,
    "spine node (branch-a:inner) must be a fresh reference",
  );
  assert.equal(
    (patched.props as { text?: string }).text,
    "Edited",
    "the patch was actually applied",
  );
});

test("insertBuilderNode: copy-on-write shares off-path subtrees, freshens only the target parent spine", () => {
  const tree = fixture();
  const before = structuredClone(tree);
  const inputSiblingB = tree[1]!;
  const inputTargetParent = findNode(tree, "branch-a:inner")!;

  const result = insertBuilderNode({
    tree,
    parentId: "branch-a:inner",
    index: 1,
    node: { id: "inserted", kind: "paragraph", props: { text: "New" } } as BuilderNode,
  });
  assert.ok(result.ok, "insert should succeed");
  const next = result.tree;

  // (a) The untouched sibling subtree keeps its ORIGINAL reference.
  assert.strictEqual(
    next[1],
    inputSiblingB,
    "off-path sibling (branch-b) must be reference-equal across the insert",
  );

  // (b) The input tree was not mutated in place.
  assert.deepEqual(tree, before, "insert must not mutate its input tree");

  // (c) The mutated parent IS a new reference; the inserted node is present.
  assert.notStrictEqual(
    findNode(next, "branch-a:inner"),
    inputTargetParent,
    "the spliced parent must be a fresh reference",
  );
  assert.ok(findNode(next, "inserted"), "the inserted node is present in the result");
});

test("removeBuilderNode: copy-on-write shares off-path subtrees, freshens only the parent spine", () => {
  const tree = fixture();
  const before = structuredClone(tree);
  const inputSiblingB = tree[1]!;
  const inputTargetParent = findNode(tree, "branch-a:inner")!;

  const result = removeBuilderNode({ tree, nodeId: "deep-target" });
  assert.ok(result.ok, "remove should succeed");
  const next = result.tree;

  // (a) The untouched sibling subtree keeps its ORIGINAL reference.
  assert.strictEqual(
    next[1],
    inputSiblingB,
    "off-path sibling (branch-b) must be reference-equal across the remove",
  );

  // (b) The input tree was not mutated in place.
  assert.deepEqual(tree, before, "remove must not mutate its input tree");

  // (c) The mutated parent IS a new reference; the node is gone.
  assert.notStrictEqual(
    findNode(next, "branch-a:inner"),
    inputTargetParent,
    "the spliced parent must be a fresh reference",
  );
  assert.equal(findNode(next, "deep-target"), null, "the removed node is gone from the result");
});

/**
 * BASE-MIRROR sync guard. The structural-sharing patch path returns the shared
 * tree WITHOUT the full `validateBuilderNodeTree` pass that used to re-derive the
 * base-mirror fields (locked / visibilityCondition) from props. The visibility
 * reader (visibility.ts) reads the base mirror FIRST, so a stale base would mask
 * the just-applied edit until the next reload. patchBuilderNodeProps must sync
 * the mirror on the node it touched. (This test fails without that sync.)
 */
test("patchBuilderNodeProps: syncs the base mirror (locked) on the shared result", () => {
  const tree: BuilderNodeTree = [
    { id: "c1", kind: "container", props: { layout: "stack" }, children: [] } as BuilderNode,
  ];

  const set = patchBuilderNodeProps({ tree, nodeId: "c1", patch: { locked: true } });
  assert.ok(set.ok, "set patch should succeed");
  assert.equal(
    (set.tree[0] as Record<string, unknown>).locked,
    true,
    "base mirror node.locked must be derived from props on the op result",
  );

  const cleared = patchBuilderNodeProps({
    tree: set.tree,
    nodeId: "c1",
    patch: { locked: false },
  });
  assert.ok(cleared.ok, "clear patch should succeed");
  assert.equal(
    (cleared.tree[0] as Record<string, unknown>).locked,
    undefined,
    "cleared base mirror must not retain a stale locked flag",
  );
});
