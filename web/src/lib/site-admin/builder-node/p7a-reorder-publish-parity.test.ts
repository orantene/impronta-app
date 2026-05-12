import assert from "node:assert/strict";
import test from "node:test";

import { buildLegacySectionBuilderTree } from "./legacy-section-tree";
import { insertBuilderNode, moveBuilderNode } from "./operations";
import { resolveSnapshotBuilderTreeForPublish } from "./snapshot-tree";
import { siblingDropGapToMoveIndex } from "./sibling-drop-gap";
import type { BuilderNode } from "./types";

test("P7A-4: builder tree stays publish-resolved after nested reorder under section", () => {
  const sectionId = "11111111-1111-4111-8111-111111111111";
  const slots = [
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId,
      sectionTypeKey: "hero",
      name: "Hero",
    },
  ] as const;

  let tree = buildLegacySectionBuilderTree([...slots]);
  const sectionNode = tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (!sectionNode || sectionNode.kind !== "section") return;
  const parentId = sectionNode.id;

  const nodes: BuilderNode[] = [
    {
      id: "free-p1",
      kind: "paragraph",
      props: { text: "First" },
    },
    {
      id: "free-p2",
      kind: "paragraph",
      props: { text: "Second" },
    },
    {
      id: "free-p3",
      kind: "paragraph",
      props: { text: "Third" },
    },
  ];

  for (let i = 0; i < nodes.length; i++) {
    const ins = insertBuilderNode({
      tree,
      parentId,
      index: i,
      node: nodes[i]!,
    });
    assert.equal(ins.ok, true);
    if (!ins.ok) return;
    tree = ins.tree;
  }

  const beforePub = resolveSnapshotBuilderTreeForPublish({
    slots: [...slots],
    builderTree: tree,
  });
  assert.equal(beforePub.ok, true);

  const section = tree.find((n) => n.id === parentId);
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section" || !section.children) return;
  const childIds = section.children.map((c) => c.id);
  const sourceIdx = 2;
  const dropGap = 0;
  const resolved = siblingDropGapToMoveIndex({
    dropGapIndex: dropGap,
    sourceSiblingIndex: sourceIdx,
    sameParent: true,
  });
  assert.equal(resolved.kind, "move");

  const moved = moveBuilderNode({
    tree,
    nodeId: childIds[sourceIdx]!,
    parentId,
    index: resolved.targetSiblingIndex,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;

  const afterPub = resolveSnapshotBuilderTreeForPublish({
    slots: [...slots],
    builderTree: moved.tree,
  });
  assert.equal(afterPub.ok, true);
  if (!afterPub.ok) return;

  const reordered = moved.tree.find((n) => n.id === parentId);
  assert.equal(reordered?.kind, "section");
  if (!reordered || reordered.kind !== "section" || !reordered.children) return;
  assert.deepEqual(reordered.children.map((c) => c.id), [
    "free-p3",
    "free-p1",
    "free-p2",
  ]);
});

test("P7A-4: blank_section composition — insert, reorder, publish-resolved", () => {
  const sectionId = "22222222-2222-4222-8222-222222222222";
  const slots = [
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId,
      sectionTypeKey: "blank_section",
      name: "Blank",
    },
  ] as const;

  let tree = buildLegacySectionBuilderTree([...slots]);
  const sectionNode = tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (!sectionNode || sectionNode.kind !== "section") return;
  assert.equal(sectionNode.props.sectionTypeKey, "blank_section");
  const parentId = sectionNode.id;
  assert.deepEqual(sectionNode.children ?? [], []);

  const nodes: BuilderNode[] = [
    { id: "blank-a", kind: "heading", props: { text: "A", level: 2 } },
    { id: "blank-b", kind: "paragraph", props: { text: "B" } },
  ];
  for (let i = 0; i < nodes.length; i++) {
    const ins = insertBuilderNode({
      tree,
      parentId,
      index: i,
      node: nodes[i]!,
    });
    assert.equal(ins.ok, true);
    if (!ins.ok) return;
    tree = ins.tree;
  }

  const beforePub = resolveSnapshotBuilderTreeForPublish({
    slots: [...slots],
    builderTree: tree,
  });
  assert.equal(beforePub.ok, true);

  const section = tree.find((n) => n.id === parentId);
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section" || !section.children) return;
  const childIds = section.children.map((c) => c.id);
  const resolved = siblingDropGapToMoveIndex({
    dropGapIndex: 0,
    sourceSiblingIndex: 1,
    sameParent: true,
  });
  assert.deepEqual(resolved, { kind: "move", targetSiblingIndex: 0 });

  const moved = moveBuilderNode({
    tree,
    nodeId: childIds[1]!,
    parentId,
    index: resolved.targetSiblingIndex,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;

  const afterPub = resolveSnapshotBuilderTreeForPublish({
    slots: [...slots],
    builderTree: moved.tree,
  });
  assert.equal(afterPub.ok, true);

  const reordered = moved.tree.find((n) => n.id === parentId);
  assert.equal(reordered?.kind, "section");
  if (!reordered || reordered.kind !== "section" || !reordered.children) return;
  assert.deepEqual(reordered.children.map((c) => c.id), ["blank-b", "blank-a"]);
});
