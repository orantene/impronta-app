/**
 * CANVAS-1 — insert-at-selection ordering unit tests.
 *
 * Tests resolveGalleryInsertHint (gallery-insert-hint.ts) which replaces the
 * hard-coded { parentId: null, index: tree.length } target in AddGalleryPanel.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test src/components/edit-chrome/add-gallery/add-gallery-panel.canvas-1.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { resolveGalleryInsertHint } from "./gallery-insert-hint";

// ── Minimal tree-node factory (no real builder-node deps needed) ─────────────
function makeSection(id: string, children: BuilderNode[] = []): BuilderNode {
  return {
    id,
    kind: "section",
    props: { sectionId: id },
    children,
  } as unknown as BuilderNode;
}

function makeContainer(id: string, children: BuilderNode[] = []): BuilderNode {
  return {
    id,
    kind: "container",
    props: {},
    children,
  } as unknown as BuilderNode;
}

function makeText(id: string): BuilderNode {
  return {
    id,
    kind: "text",
    props: {},
  } as unknown as BuilderNode;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveGalleryInsertHint — CANVAS-1", () => {
  it("returns null for unknown nodeId (stale selection guard)", () => {
    const tree: BuilderNodeTree = [makeSection("s1")];
    const result = resolveGalleryInsertHint(tree, "does-not-exist");
    assert.equal(result, null, "should return null for unknown node");
  });

  it("inserts after the first section when first section is selected", () => {
    const tree: BuilderNodeTree = [makeSection("s1"), makeSection("s2"), makeSection("s3")];
    const result = resolveGalleryInsertHint(tree, "s1");
    assert.deepEqual(result, { parentId: null, index: 1 });
  });

  it("inserts after the second section when second section is selected", () => {
    const tree: BuilderNodeTree = [makeSection("s1"), makeSection("s2"), makeSection("s3")];
    const result = resolveGalleryInsertHint(tree, "s2");
    assert.deepEqual(result, { parentId: null, index: 2 });
  });

  it("inserts after the last section when last section is selected (not at end)", () => {
    const tree: BuilderNodeTree = [makeSection("s1"), makeSection("s2")];
    const result = resolveGalleryInsertHint(tree, "s2");
    // index=2 == tree.length, same as end-of-tree here, but derived from selection
    assert.deepEqual(result, { parentId: null, index: 2 });
  });

  it("inserts into parent container when a nested text node is selected", () => {
    const text = makeText("t1");
    const container = makeContainer("c1", [makeText("t0"), text, makeText("t2")]);
    const section = makeSection("s1", [container]);
    const tree: BuilderNodeTree = [section];
    const result = resolveGalleryInsertHint(tree, "t1");
    // t1 is at index 1 inside c1; afterIndex = 2
    assert.deepEqual(result, { parentId: "c1", index: 2 });
  });

  it("inserts after container when container itself is selected (nested in section)", () => {
    const container = makeContainer("c1", [makeText("t1")]);
    const section = makeSection("s1", [container]);
    const tree: BuilderNodeTree = [section];
    const result = resolveGalleryInsertHint(tree, "c1");
    // c1 is at index 0 inside s1; afterIndex = 1
    assert.deepEqual(result, { parentId: "s1", index: 1 });
  });

  it("correctly disambiguates when multiple sections exist and a nested node is selected", () => {
    const text = makeText("target");
    const container = makeContainer("c2", [text]);
    const s1 = makeSection("s1", []);
    const s2 = makeSection("s2", [container]);
    const s3 = makeSection("s3", []);
    const tree: BuilderNodeTree = [s1, s2, s3];
    const result = resolveGalleryInsertHint(tree, "target");
    // target is inside c2 at index 0 → afterIndex = 1, parentId = c2
    assert.deepEqual(result, { parentId: "c2", index: 1 });
  });

  it("falls back correctly: end-of-tree when no selection (caller handles null)", () => {
    const tree: BuilderNodeTree = [makeSection("s1")];
    // Caller is responsible: null selectedBuilderNodeId → skip hint
    const result = resolveGalleryInsertHint(tree, "no-such-node");
    assert.equal(result, null);
    // Verify caller fallback: parentId:null, index:tree.length
    const fallback = result ?? { parentId: null, index: tree.length };
    assert.deepEqual(fallback, { parentId: null, index: 1 });
  });

  it("handles empty tree without throwing", () => {
    const tree: BuilderNodeTree = [];
    const result = resolveGalleryInsertHint(tree, "any");
    assert.equal(result, null);
  });

  it("ordering: insert AFTER (not before) the selected sibling", () => {
    const text1 = makeText("a");
    const text2 = makeText("b");
    const text3 = makeText("c");
    const container = makeContainer("col", [text1, text2, text3]);
    const section = makeSection("s1", [container]);
    const tree: BuilderNodeTree = [section];

    // selecting "b" (index=1) → insert after → index=2 (between b and c)
    const result = resolveGalleryInsertHint(tree, "b");
    assert.deepEqual(result, { parentId: "col", index: 2 });

    // selecting "a" (index=0) → insert after → index=1 (between a and b)
    const resultA = resolveGalleryInsertHint(tree, "a");
    assert.deepEqual(resultA, { parentId: "col", index: 1 });

    // selecting "c" (index=2, last) → insert after → index=3 (append to container)
    const resultC = resolveGalleryInsertHint(tree, "c");
    assert.deepEqual(resultC, { parentId: "col", index: 3 });
  });
});
