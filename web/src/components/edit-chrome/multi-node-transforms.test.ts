import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node";
import {
  cloneNodeWithFreshIds,
  duplicateBuilderNodes,
  groupSiblingBuilderNodes,
  pasteBuilderNodeClipboard,
  removeBuilderNodes,
  serializeBuilderNodeClipboard,
  ungroupBuilderNode,
} from "./multi-node-transforms";

function fixtureTree(): BuilderNodeTree {
  return [
    {
      id: "section-1",
      kind: "section",
      props: {
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "custom",
      },
      children: [
        { id: "heading-1", kind: "heading", props: { text: "One", level: 2 } },
        { id: "paragraph-1", kind: "paragraph", props: { text: "Two" } },
        { id: "button-1", kind: "button", props: { label: "Three", href: "/" } },
      ],
    },
  ];
}

function firstSection(tree: BuilderNodeTree) {
  const section = tree[0];
  assert.equal(section?.kind, "section");
  return section as Extract<BuilderNode, { kind: "section" }>;
}

test("groupSiblingBuilderNodes wraps selected siblings in a container preserving order", () => {
  const grouped = groupSiblingBuilderNodes(
    fixtureTree(),
    ["heading-1", "paragraph-1"],
    () => "group-1",
  );
  assert.equal(grouped.ok, true);
  if (!grouped.ok) return;
  const children = firstSection(grouped.tree).children ?? [];
  assert.deepEqual(children.map((node) => node.id), ["group-1", "button-1"]);
  const group = children[0];
  assert.equal(group?.kind, "container");
  if (!group || group.kind !== "container") return;
  assert.deepEqual(group.children.map((node) => node.id), [
    "heading-1",
    "paragraph-1",
  ]);
});

test("ungroupBuilderNode unwraps a selected container in place", () => {
  const grouped = groupSiblingBuilderNodes(
    fixtureTree(),
    ["heading-1", "paragraph-1"],
    () => "group-1",
  );
  assert.equal(grouped.ok, true);
  if (!grouped.ok) return;
  const ungrouped = ungroupBuilderNode(grouped.tree, "group-1");
  assert.equal(ungrouped.ok, true);
  if (!ungrouped.ok) return;
  assert.deepEqual(
    firstSection(ungrouped.tree).children?.map((node) => node.id),
    ["heading-1", "paragraph-1", "button-1"],
  );
});

test("duplicateBuilderNodes duplicates selected siblings in one transform", () => {
  const duplicated = duplicateBuilderNodes(fixtureTree(), [
    "heading-1",
    "paragraph-1",
  ]);
  assert.equal(duplicated.ok, true);
  if (!duplicated.ok) return;
  const ids = firstSection(duplicated.tree).children?.map((node) => node.id);
  assert.equal(ids?.length, 5);
  assert.equal(ids?.[0], "heading-1");
  assert.equal(ids?.[1], "paragraph-1");
  assert.notEqual(ids?.[2], "heading-1");
  assert.notEqual(ids?.[3], "paragraph-1");
  assert.equal(ids?.[4], "button-1");
});

test("removeBuilderNodes deletes multiple selected nodes in one transform", () => {
  const removed = removeBuilderNodes(fixtureTree(), ["heading-1", "button-1"]);
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.deepEqual(
    firstSection(removed.tree).children?.map((node) => node.id),
    ["paragraph-1"],
  );
});

test("clipboard serialization and paste re-mint ids for node subtrees", () => {
  const serialized = serializeBuilderNodeClipboard(fixtureTree(), [
    "heading-1",
    "paragraph-1",
  ]);
  assert.ok(!("error" in serialized));
  if ("error" in serialized) return;
  const pasted = pasteBuilderNodeClipboard(fixtureTree(), serialized, "button-1");
  assert.equal(pasted.ok, true);
  if (!pasted.ok) return;
  const ids = firstSection(pasted.tree).children?.map((node) => node.id) ?? [];
  assert.equal(ids.length, 5);
  assert.deepEqual(ids.slice(0, 3), ["heading-1", "paragraph-1", "button-1"]);
  assert.notEqual(ids[3], "heading-1");
  assert.notEqual(ids[4], "paragraph-1");
});

test("clipboard payloads paste across page trees with fresh ids", () => {
  const serialized = serializeBuilderNodeClipboard(fixtureTree(), [
    "heading-1",
    "paragraph-1",
  ]);
  assert.ok(!("error" in serialized));
  if ("error" in serialized) return;
  const targetTree: BuilderNodeTree = [
    {
      id: "section-2",
      kind: "section",
      props: {
        sectionId: "22222222-2222-4222-8222-222222222222",
        sectionTypeKey: "custom",
      },
      children: [
        { id: "button-target", kind: "button", props: { label: "Target", href: "/" } },
      ],
    },
  ];
  const pasted = pasteBuilderNodeClipboard(targetTree, serialized, "button-target");
  assert.equal(pasted.ok, true);
  if (!pasted.ok) return;
  assert.equal(pasted.nodeIds.length, 2);
  assert.ok(pasted.nodeIds.every((id) => !["heading-1", "paragraph-1"].includes(id)));
  const ids = firstSection(pasted.tree).children?.map((node) => node.id) ?? [];
  assert.deepEqual(ids, ["button-target", ...pasted.nodeIds]);
});

test("cloneNodeWithFreshIds rewrites tab default ids alongside descendants", () => {
  let next = 0;
  const tab = {
    id: "tabs-1",
    kind: "tabs",
    props: { defaultTabId: "panel-1" },
    children: [
      {
        id: "panel-1",
        kind: "tab_panel",
        props: { title: "One" },
        children: [{ id: "copy-1", kind: "paragraph", props: { text: "Copy" } }],
      },
    ],
  } satisfies BuilderNode;
  const cloned = cloneNodeWithFreshIds(tab, (kind) => `${kind}-fresh-${++next}`);
  assert.equal(cloned.id, "tabs-fresh-1");
  assert.equal(cloned.kind, "tabs");
  assert.equal(cloned.props.defaultTabId, "tab_panel-fresh-2");
});
