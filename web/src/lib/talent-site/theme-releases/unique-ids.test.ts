/**
 * F131: nodes inserted into a talent tree never reuse an id already in it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { collectNodeIds, dedupeTreeIds, findDuplicateNodeIds } from "@/lib/site-admin/builder-node/unique-ids";
import { withUniqueTreeIds } from "@/lib/talent-site/history/writer";
import { mergeDesignUpdate } from "./merge";
import { built } from "./test-fixtures";
import { readOrigin } from "./origin";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignSide } from "./types";

/** Give every node of the new gallery block the id of an existing node (positional ids). */
function collideGallery(theirs: DesignSide, ours: DesignSide): DesignSide {
  const taken = collectNodeIds(ours.trees.home!);
  let i = 0;
  const rewrite = (n: BuilderNode): BuilderNode => {
    const kids = "children" in n && Array.isArray(n.children) ? (n.children as BuilderNode[]).map(rewrite) : undefined;
    return { ...n, id: taken[i++ % taken.length]!, ...(kids ? { children: kids } : {}) } as BuilderNode;
  };
  return {
    ...theirs,
    trees: {
      ...theirs.trees,
      home: theirs.trees.home!.map((n) => (readOrigin(n)?.key === "gallery" ? rewrite(n) : n)),
    },
  };
}

test("add-block into a tree that already uses the colliding ids gives unique ids", () => {
  const ours = built(1);
  const theirs = collideGallery(built(2, { withGallery: true }), ours);
  const r = mergeDesignUpdate({
    base: built(1),
    ours,
    theirs,
    items: [{ type: "new-block", key: "home:gallery" }],
  });
  assert.equal(r.report.added.length, 1);
  assert.deepEqual(findDuplicateNodeIds(r.trees.home!), []);
  assert.ok(r.trees.home!.some((n) => readOrigin(n)?.key === "gallery"), "block was inserted");
});

test("a full merge insert (no item filter) gives unique ids, origin keys untouched", () => {
  const ours = built(1);
  const theirs = collideGallery(built(2, { withGallery: true }), ours);
  const r = mergeDesignUpdate({ base: built(1), ours, theirs });
  assert.deepEqual(findDuplicateNodeIds(r.trees.home!), []);
  const gallery = r.trees.home!.find((n) => readOrigin(n)?.key === "gallery")!;
  assert.equal(readOrigin(gallery)?.key, "gallery");
});

test("dedupeTreeIds keeps the first id and remaps later ones, children included", () => {
  const tree = [
    { id: "a", children: [{ id: "b" }] },
    { id: "a", children: [{ id: "b" }, { id: "c" }] },
  ];
  const out = dedupeTreeIds(tree);
  assert.equal(out.remapped, 2);
  assert.deepEqual(findDuplicateNodeIds(out.tree), []);
  assert.equal(out.tree[0]!.id, "a");
});

test("dedupeTreeIds returns the same array when nothing collides", () => {
  const tree = [{ id: "a" }, { id: "b" }];
  assert.equal(dedupeTreeIds(tree).tree, tree);
});

test("writer guard: a draft write never carries duplicate ids", () => {
  const dup = [{ id: "maison-v2-39" }, { id: "maison-v2-39" }];
  const out = withUniqueTreeIds({
    siteId: "s",
    site: { shell_tree: dup },
    pages: [{ id: "p1", patch: { blocks: dup, title: "x" } }],
  });
  assert.deepEqual(findDuplicateNodeIds(out.site!.shell_tree as unknown[]), []);
  const blocks = (out.pages![0]!.patch as { blocks: unknown[] }).blocks;
  assert.deepEqual(findDuplicateNodeIds(blocks), []);
  assert.equal((out.pages![0]!.patch as { title: string }).title, "x");
});
