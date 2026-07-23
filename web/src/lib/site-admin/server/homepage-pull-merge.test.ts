/**
 * homepage-pull-merge.test.ts — unit tests for `mergeBuilderTrees`, the pure
 * merge helper behind Pull-from-live's three modes (replace / above / below)
 * in ./homepage.ts.
 *
 * Contract under test:
 *   1. replace → the published tree verbatim (draft discarded).
 *   2. above / below with a SINGLE root container on both sides → merge at the
 *      root container's children level, keeping the DRAFT's own root container.
 *      `above` puts published children first; `below` puts them last.
 *   3. id-remint → the merged tree contains NO duplicate node ids even when the
 *      draft and published subtrees share ids (the published side is re-minted).
 *   4. multi-root / non-container fallback → concatenate the top-level node
 *      arrays in the requested order.
 *
 * Runs under the Node test runner via tsx (same harness as
 * copy-published-to-draft.test.ts); importing ./homepage pulls `next/cache` +
 * `server-only`, handled by scripts/register-server-only-test.cjs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import { mergeBuilderTrees } from "./homepage";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function heading(id: string, text: string): BuilderNode {
  return { id, kind: "heading", props: { text, level: 2 } } as BuilderNode;
}

function container(id: string, children: BuilderNode[]): BuilderNode {
  return { id, kind: "container", props: {}, children } as BuilderNode;
}

/** Collect every node id in a tree (top-level + all descendants). */
function collectIds(tree: BuilderNodeTree): string[] {
  const ids: string[] = [];
  const stack: BuilderNode[] = [...tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    ids.push(node.id);
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) stack.push(...children);
  }
  return ids;
}

/** The canonical home shape: [ rootContainer([ section-a, section-b ]) ]. */
function singleRootTree(rootId: string, childIds: string[]): BuilderNodeTree {
  return [container(rootId, childIds.map((cid) => heading(cid, cid)))];
}

// ---------------------------------------------------------------------------
// 1. replace
// ---------------------------------------------------------------------------

test("replace: returns the published tree verbatim (draft discarded)", () => {
  const draft = singleRootTree("draft-root", ["d1", "d2"]);
  const published = singleRootTree("pub-root", ["p1"]);
  const merged = mergeBuilderTrees(draft, published, "replace");
  assert.deepEqual(merged, published, "replace returns the published tree as-is");
});

// ---------------------------------------------------------------------------
// 2. above / below — single root container merge
// ---------------------------------------------------------------------------

test("above: single-root containers → published children FIRST, keeps draft's root", () => {
  const draft = singleRootTree("draft-root", ["d1", "d2"]);
  const published = singleRootTree("pub-root", ["p1", "p2"]);
  const merged = mergeBuilderTrees(draft, published, "above");

  assert.equal(merged.length, 1, "still a single root container");
  const root = merged[0] as BuilderNode & { children: BuilderNode[] };
  assert.equal(root.id, "draft-root", "the DRAFT's root container is preserved");
  // Published children (re-minted ids) come first, then the draft's originals.
  const childTexts = root.children.map((c) => (c.props as { text: string }).text);
  assert.deepEqual(
    childTexts,
    ["p1", "p2", "d1", "d2"],
    "above → published sections first, then draft sections",
  );
  // The draft's own children keep their original ids.
  assert.deepEqual(
    root.children.slice(2).map((c) => c.id),
    ["d1", "d2"],
    "draft children keep their original ids",
  );
});

test("below: single-root containers → draft children FIRST, published last", () => {
  const draft = singleRootTree("draft-root", ["d1", "d2"]);
  const published = singleRootTree("pub-root", ["p1", "p2"]);
  const merged = mergeBuilderTrees(draft, published, "below");

  const root = merged[0] as BuilderNode & { children: BuilderNode[] };
  assert.equal(root.id, "draft-root", "the DRAFT's root container is preserved");
  const childTexts = root.children.map((c) => (c.props as { text: string }).text);
  assert.deepEqual(
    childTexts,
    ["d1", "d2", "p1", "p2"],
    "below → draft sections first, then published sections",
  );
});

// ---------------------------------------------------------------------------
// 3. id-remint — no duplicate ids even when both sides share ids
// ---------------------------------------------------------------------------

test("above: re-mints published ids so a shared-id merge has NO duplicate ids", () => {
  // Draft and published deliberately share the SAME child ids ("s1", "s2") and
  // even the same root id — a naive concat would corrupt the tree with dupes.
  const draft = singleRootTree("root", ["s1", "s2"]);
  const published = singleRootTree("root", ["s1", "s2"]);
  const merged = mergeBuilderTrees(draft, published, "above");

  const ids = collectIds(merged);
  assert.equal(
    new Set(ids).size,
    ids.length,
    `merged tree has no duplicate ids (got ${JSON.stringify(ids)})`,
  );
  // The DRAFT side keeps its ids; the published side is re-minted to new ones.
  assert.ok(ids.includes("s1") && ids.includes("s2"), "draft child ids survive");
});

test("below: re-mints published ids so a shared-id merge has NO duplicate ids", () => {
  const draft = singleRootTree("root", ["s1", "s2"]);
  const published = singleRootTree("root", ["s1", "s2"]);
  const merged = mergeBuilderTrees(draft, published, "below");
  const ids = collectIds(merged);
  assert.equal(new Set(ids).size, ids.length, "no duplicate ids after below merge");
});

// ---------------------------------------------------------------------------
// 4. multi-root / non-container fallback — concat top-level arrays
// ---------------------------------------------------------------------------

test("above fallback: multi-root draft → concat published nodes BEFORE draft nodes", () => {
  // Draft is multi-root (two top-level headings, not a single container).
  const draft: BuilderNodeTree = [heading("d1", "d1"), heading("d2", "d2")];
  const published = singleRootTree("pub-root", ["p1"]);
  const merged = mergeBuilderTrees(draft, published, "above");

  // Fallback concatenates the top-level arrays: published (re-minted) first.
  assert.equal(merged.length, 3, "1 published root + 2 draft roots");
  assert.equal(merged[0].kind, "container", "published root container comes first");
  assert.deepEqual(
    [merged[1].id, merged[2].id],
    ["d1", "d2"],
    "draft top-level nodes follow, ids intact",
  );
  const ids = collectIds(merged);
  assert.equal(new Set(ids).size, ids.length, "no duplicate ids in fallback merge");
});

test("below fallback: multi-root published → concat draft nodes BEFORE published nodes", () => {
  const draft = singleRootTree("draft-root", ["d1"]);
  const published: BuilderNodeTree = [heading("p1", "p1"), heading("p2", "p2")];
  const merged = mergeBuilderTrees(draft, published, "below");

  assert.equal(merged.length, 3, "1 draft root + 2 published roots");
  assert.equal(merged[0].id, "draft-root", "draft root container comes first");
  const ids = collectIds(merged);
  assert.equal(new Set(ids).size, ids.length, "no duplicate ids in fallback merge");
});

test("above: empty draft → published (re-minted) becomes the whole tree", () => {
  const draft: BuilderNodeTree = [];
  const published = singleRootTree("pub-root", ["p1", "p2"]);
  const merged = mergeBuilderTrees(draft, published, "above");
  // Empty draft is not a single-root container → fallback concat with nothing.
  const childCount = collectIds(merged).length;
  assert.ok(childCount >= 3, "published root + its children survive an empty draft");
  const ids = collectIds(merged);
  assert.equal(new Set(ids).size, ids.length, "no duplicate ids");
});
