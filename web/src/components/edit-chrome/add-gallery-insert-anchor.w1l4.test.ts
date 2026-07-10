/**
 * W1-L4 — resolveInsertAnchor unit tests.
 *
 * Covers the "where does a gallery insert land" decision so a click-to-insert
 * no longer drops the block at the far bottom of the page with no scroll/flash.
 * Lives at the top-level edit-chrome dir so it is picked up by the
 * `test:builder-chrome` glob (`src/components/edit-chrome/*.test.ts`).
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test src/components/edit-chrome/add-gallery-insert-anchor.w1l4.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { resolveInsertAnchor } from "./add-gallery/gallery-insert-hint";

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

describe("resolveInsertAnchor — W1-L4", () => {
  it("selection wins: inserts after the selected root section", () => {
    const tree: BuilderNodeTree = [
      makeSection("s1"),
      makeSection("s2"),
      makeSection("s3"),
    ];
    // selected s2, viewport is s1 — selection must win over viewport.
    const anchor = resolveInsertAnchor(tree, "s2", "s1");
    assert.deepEqual(anchor, { parentId: null, index: 2 });
  });

  it("selection wins: inserts into the container of a selected nested node", () => {
    const container = makeContainer("c1", [makeText("t0"), makeText("t1")]);
    const tree: BuilderNodeTree = [makeSection("s1", [container])];
    const anchor = resolveInsertAnchor(tree, "t1", null);
    assert.deepEqual(anchor, { parentId: "c1", index: 2 });
  });

  it("viewport fallback: nothing selected → inserts after the viewport section", () => {
    const tree: BuilderNodeTree = [
      makeSection("s1"),
      makeSection("s2"),
      makeSection("s3"),
    ];
    // No selection; the section in the viewport is s2 → land right after it,
    // NOT at the bottom (index 3).
    const anchor = resolveInsertAnchor(tree, null, "s2");
    assert.deepEqual(anchor, { parentId: null, index: 2 });
  });

  it("viewport fallback: used when the selection is stale (not in tree)", () => {
    const tree: BuilderNodeTree = [makeSection("s1"), makeSection("s2")];
    // selectedNodeId points at a removed node; viewport section s1 takes over.
    const anchor = resolveInsertAnchor(tree, "ghost", "s1");
    assert.deepEqual(anchor, { parentId: null, index: 1 });
  });

  it("nothing-selected + no viewport → falls back to end of tree", () => {
    const tree: BuilderNodeTree = [makeSection("s1"), makeSection("s2")];
    const anchor = resolveInsertAnchor(tree, null, null);
    assert.deepEqual(anchor, { parentId: null, index: 2 });
  });

  it("both selection and viewport stale → end-of-tree fallback (never null)", () => {
    const tree: BuilderNodeTree = [makeSection("s1")];
    const anchor = resolveInsertAnchor(tree, "ghost", "also-ghost");
    assert.deepEqual(anchor, { parentId: null, index: 1 });
  });

  it("empty page: always returns a concrete { parentId: null, index: 0 }", () => {
    const tree: BuilderNodeTree = [];
    assert.deepEqual(resolveInsertAnchor(tree, null, null), {
      parentId: null,
      index: 0,
    });
    assert.deepEqual(resolveInsertAnchor(tree, "x", "y"), {
      parentId: null,
      index: 0,
    });
  });

  it("empty-string ids are treated as absent (defensive)", () => {
    const tree: BuilderNodeTree = [makeSection("s1"), makeSection("s2")];
    const anchor = resolveInsertAnchor(tree, "", "");
    assert.deepEqual(anchor, { parentId: null, index: 2 });
  });

  it("viewport section nested resolution: after the owning root section", () => {
    // If a viewport id happens to be a nested node, it still lands after its
    // owning root section (mirrors resolveGalleryInsertHint semantics).
    const container = makeContainer("c1", [makeText("t1")]);
    const tree: BuilderNodeTree = [
      makeSection("s1"),
      makeSection("s2", [container]),
      makeSection("s3"),
    ];
    const anchor = resolveInsertAnchor(tree, null, "t1");
    // t1 lives inside c1 (in s2) → insert into c1 after t1.
    assert.deepEqual(anchor, { parentId: "c1", index: 1 });
  });
});
