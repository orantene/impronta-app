import assert from "node:assert/strict";
import test from "node:test";

import { buildLegacySectionBuilderTree } from "./snapshot-slot-bridge";
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

test("P7A-4: cross-section move — paragraph from one blank_section to another stays publish-resolved", () => {
  const sectionIdA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sectionIdB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const slots = [
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId: sectionIdA,
      sectionTypeKey: "blank_section",
      name: "First",
    },
    {
      slotKey: "body",
      sortOrder: 1,
      sectionId: sectionIdB,
      sectionTypeKey: "blank_section",
      name: "Second",
    },
  ] as const;

  let tree = buildLegacySectionBuilderTree([...slots]);
  assert.equal(tree.length, 2);
  const secA = tree[0];
  const secB = tree[1];
  assert.equal(secA?.kind, "section");
  assert.equal(secB?.kind, "section");
  if (!secA || secA.kind !== "section" || !secB || secB.kind !== "section") return;

  const parentIdA = secA.id;
  const parentIdB = secB.id;

  const para: BuilderNode = {
    id: "cross-para-1",
    kind: "paragraph",
    props: { text: "Jumped" },
  };
  const ins = insertBuilderNode({
    tree,
    parentId: parentIdA,
    index: 0,
    node: para,
  });
  assert.equal(ins.ok, true);
  if (!ins.ok) return;
  tree = ins.tree;

  const beforeMove = resolveSnapshotBuilderTreeForPublish({
    slots: [...slots],
    builderTree: tree,
  });
  assert.equal(beforeMove.ok, true);

  const moved = moveBuilderNode({
    tree,
    nodeId: para.id,
    parentId: parentIdB,
    index: 0,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;

  const afterMove = resolveSnapshotBuilderTreeForPublish({
    slots: [...slots],
    builderTree: moved.tree,
  });
  assert.equal(afterMove.ok, true);

  const nextA = moved.tree.find((n) => n.id === parentIdA);
  const nextB = moved.tree.find((n) => n.id === parentIdB);
  assert.equal(nextA?.kind, "section");
  assert.equal(nextB?.kind, "section");
  if (!nextA || nextA.kind !== "section" || !nextB || nextB.kind !== "section") return;
  assert.deepEqual(
    (nextA.children ?? []).map((c) => c.id),
    [],
    "source section empty after move",
  );
  assert.deepEqual(
    (nextB.children ?? []).map((c) => c.id),
    [para.id],
    "destination section owns moved paragraph",
  );
});

test("P7A-4: cross-slot move — paragraph from body blank_section to footer blank_section stays publish-resolved", () => {
  const sectionBody = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const sectionFooter = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const slots = [
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId: sectionBody,
      sectionTypeKey: "blank_section",
      name: "Body",
    },
    {
      slotKey: "footer",
      sortOrder: 0,
      sectionId: sectionFooter,
      sectionTypeKey: "blank_section",
      name: "Footer",
    },
  ] as const;

  let tree = buildLegacySectionBuilderTree([...slots]);
  assert.equal(tree.length, 2);
  const secBody = tree.find((n) => n.kind === "section" && n.props.slotKey === "body");
  const secFooter = tree.find((n) => n.kind === "section" && n.props.slotKey === "footer");
  assert.equal(secBody?.kind, "section");
  assert.equal(secFooter?.kind, "section");
  if (!secBody || secBody.kind !== "section" || !secFooter || secFooter.kind !== "section") return;

  const para: BuilderNode = {
    id: "cross-slot-para",
    kind: "paragraph",
    props: { text: "In footer slot" },
  };
  const ins = insertBuilderNode({
    tree,
    parentId: secBody.id,
    index: 0,
    node: para,
  });
  assert.equal(ins.ok, true);
  if (!ins.ok) return;
  tree = ins.tree;

  const before = resolveSnapshotBuilderTreeForPublish({
    slots: [...slots],
    builderTree: tree,
  });
  assert.equal(before.ok, true);

  const moved = moveBuilderNode({
    tree,
    nodeId: para.id,
    parentId: secFooter.id,
    index: 0,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;

  const after = resolveSnapshotBuilderTreeForPublish({
    slots: [...slots],
    builderTree: moved.tree,
  });
  assert.equal(after.ok, true);

  const bodyNode = moved.tree.find((n) => n.id === secBody.id);
  const footerNode = moved.tree.find((n) => n.id === secFooter.id);
  assert.equal(bodyNode?.kind, "section");
  assert.equal(footerNode?.kind, "section");
  if (!bodyNode || bodyNode.kind !== "section" || !footerNode || footerNode.kind !== "section") return;
  assert.deepEqual((bodyNode.children ?? []).map((c) => c.id), []);
  assert.deepEqual((footerNode.children ?? []).map((c) => c.id), [para.id]);
});
