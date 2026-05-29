import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNodeTree } from "./types";
import {
  applyBuilderNodeOperation,
  duplicateBuilderNode,
  insertBuilderNode,
  moveBuilderNode,
  pasteBuilderNode,
  patchBuilderNodeProps,
  removeBuilderNode,
} from "./operations";
import { validateBuilderNodeTree } from "./validate";

function fixtureTree(): BuilderNodeTree {
  return [
    {
      id: "section-1",
      kind: "section",
      props: {
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "hero",
        slotKey: "body",
        sortOrder: 0,
      },
      children: [
        {
          id: "section-1:heading:headline",
          kind: "heading",
          props: { text: "Hero headline", level: 1 },
        },
        {
          id: "section-1:paragraph:subheadline",
          kind: "paragraph",
          props: { text: "Hero subheadline" },
        },
      ],
    },
    {
      id: "container-1",
      kind: "container",
      props: { layout: "stack", gap: "m" },
      children: [
        {
          id: "container-1:heading",
          kind: "heading",
          props: { text: "Nested heading", level: 2 },
        },
      ],
    },
  ];
}

test("insertBuilderNode inserts supported root node at requested index", () => {
  const inserted = insertBuilderNode({
    tree: fixtureTree(),
    parentId: null,
    index: 1,
    node: {
      id: "container-root",
      kind: "container",
      props: { layout: "stack" },
      children: [],
    },
  });
  assert.equal(inserted.ok, true);
  if (!inserted.ok) return;
  assert.equal(inserted.tree[1]?.id, "container-root");
  assert.equal(inserted.tree.length, 3);
});

test("insertBuilderNode rejects leaf nodes at root", () => {
  const inserted = insertBuilderNode({
    tree: fixtureTree(),
    parentId: null,
    node: {
      id: "spacer-root",
      kind: "spacer",
      props: { size: "m" },
    },
  });
  assert.equal(inserted.ok, false);
  if (inserted.ok) return;
  assert.equal(inserted.code, "ROOT_KIND_NOT_ALLOWED");
});

test("insertBuilderNode rejects children under leaf parent", () => {
  const inserted = insertBuilderNode({
    tree: fixtureTree(),
    parentId: "section-1:heading:headline",
    node: {
      id: "illegal-child",
      kind: "paragraph",
      props: { text: "Nope" },
    },
  });
  assert.equal(inserted.ok, false);
  if (inserted.ok) return;
  assert.equal(inserted.code, "PARENT_DOES_NOT_ALLOW_CHILDREN");
});

test("insertBuilderNode rejects child kind not allowed by parent policy", () => {
  const inserted = insertBuilderNode({
    tree: fixtureTree(),
    parentId: "container-1",
    node: {
      id: "illegal-section-child",
      kind: "section",
      props: {
        sectionId: "22222222-2222-4222-8222-222222222222",
        sectionTypeKey: "hero",
      },
    },
  });
  assert.equal(inserted.ok, false);
  if (inserted.ok) return;
  assert.equal(inserted.code, "CHILD_KIND_NOT_ALLOWED");
});

test("moveBuilderNode reorders within the same parent", () => {
  const moved = moveBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1:paragraph:subheadline",
    parentId: "section-1",
    index: 0,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const section = moved.tree.find((node) => node.id === "section-1");
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  assert.equal(section.children?.[0]?.id, "section-1:paragraph:subheadline");
  assert.equal(section.children?.[1]?.id, "section-1:heading:headline");
});

test("moveBuilderNode moves down within the same parent", () => {
  const moved = moveBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1:heading:headline",
    parentId: "section-1",
    index: 1,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const section = moved.tree.find((node) => node.id === "section-1");
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  assert.equal(section.children?.[0]?.id, "section-1:paragraph:subheadline");
  assert.equal(section.children?.[1]?.id, "section-1:heading:headline");
});

test("moveBuilderNode moves to the end within the same parent", () => {
  const tree = fixtureTree();
  const section = tree.find((node) => node.id === "section-1");
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  section.children?.push({
    id: "section-1:button:cta",
    kind: "button",
    props: {
      label: "Book now",
      href: "/book",
    },
  });

  const moved = moveBuilderNode({
    tree,
    nodeId: "section-1:heading:headline",
    parentId: "section-1",
    index: 2,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const movedSection = moved.tree.find((node) => node.id === "section-1");
  assert.equal(movedSection?.kind, "section");
  if (!movedSection || movedSection.kind !== "section") return;
  assert.deepEqual(
    movedSection.children?.map((node) => node.id),
    [
      "section-1:paragraph:subheadline",
      "section-1:button:cta",
      "section-1:heading:headline",
    ],
  );
});

test("moveBuilderNode allows no-op target positions without mutating order", () => {
  const movedSameIndex = moveBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1:heading:headline",
    parentId: "section-1",
    index: 0,
  });
  assert.equal(movedSameIndex.ok, true);
  if (!movedSameIndex.ok) return;
  const sameIndexSection = movedSameIndex.tree.find((node) => node.id === "section-1");
  assert.equal(sameIndexSection?.kind, "section");
  if (!sameIndexSection || sameIndexSection.kind !== "section") return;
  assert.deepEqual(
    sameIndexSection.children?.map((node) => node.id),
    ["section-1:heading:headline", "section-1:paragraph:subheadline"],
  );

  const movedAlreadyLast = moveBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1:paragraph:subheadline",
    parentId: "section-1",
    index: 2,
  });
  assert.equal(movedAlreadyLast.ok, true);
  if (!movedAlreadyLast.ok) return;
  const alreadyLastSection = movedAlreadyLast.tree.find((node) => node.id === "section-1");
  assert.equal(alreadyLastSection?.kind, "section");
  if (!alreadyLastSection || alreadyLastSection.kind !== "section") return;
  assert.deepEqual(
    alreadyLastSection.children?.map((node) => node.id),
    ["section-1:heading:headline", "section-1:paragraph:subheadline"],
  );
});

test("moveBuilderNode rejects moving a node into its descendant", () => {
  const moved = moveBuilderNode({
    tree: fixtureTree(),
    nodeId: "container-1",
    parentId: "container-1:heading",
    index: 0,
  });
  assert.equal(moved.ok, false);
  if (moved.ok) return;
  assert.equal(moved.code, "INVALID_MOVE_TARGET");
  assert.ok(moved.issues?.some((issue) => issue.path === "target.parentId"));
});

test("moveBuilderNode moves a node across parent groups when allowed", () => {
  const moved = moveBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1:paragraph:subheadline",
    parentId: "container-1",
    index: 1,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;

  const section = moved.tree.find((node) => node.id === "section-1");
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  assert.equal(section.children?.length, 1);
  assert.equal(section.children?.[0]?.id, "section-1:heading:headline");

  const container = moved.tree.find((node) => node.id === "container-1");
  assert.equal(container?.kind, "container");
  if (!container || container.kind !== "container") return;
  assert.equal(container.children.length, 2);
  assert.equal(container.children[1]?.id, "section-1:paragraph:subheadline");
});

test("moveBuilderNode rejects disallowed cross-parent child kinds", () => {
  const moved = moveBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1",
    parentId: "container-1",
    index: 0,
  });
  assert.equal(moved.ok, false);
  if (moved.ok) return;
  assert.equal(moved.code, "CHILD_KIND_NOT_ALLOWED");
});

test("moveBuilderNode rejects leaf nodes moved to root", () => {
  const moved = moveBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1:paragraph:subheadline",
    parentId: null,
    index: 0,
  });
  assert.equal(moved.ok, false);
  if (moved.ok) return;
  assert.equal(moved.code, "ROOT_KIND_NOT_ALLOWED");
});

test("moveBuilderNode rejects moving the last tab panel out of its group", () => {
  const moved = moveBuilderNode({
    tree: [
      {
        id: "tabs-1",
        kind: "tabs",
        props: {},
        children: [
          {
            id: "tab-1",
            kind: "tab_panel",
            props: { title: "Only tab" },
            children: [],
          },
        ],
      },
      {
        id: "tabs-2",
        kind: "tabs",
        props: {},
        children: [
          {
            id: "tab-2",
            kind: "tab_panel",
            props: { title: "Other tab" },
            children: [],
          },
        ],
      },
    ],
    nodeId: "tab-1",
    parentId: "tabs-2",
    index: 1,
  });
  assert.equal(moved.ok, false);
  if (moved.ok) return;
  assert.equal(moved.code, "INVALID_MOVE_TARGET");
  assert.ok(moved.issues?.some((issue) => issue.path === "source.group"));
});

test("patchBuilderNodeProps updates props when valid", () => {
  const patched = patchBuilderNodeProps({
    tree: fixtureTree(),
    nodeId: "container-1:heading",
    patch: { text: "Updated heading" },
  });
  assert.equal(patched.ok, true);
  if (!patched.ok) return;
  const container = patched.tree.find((node) => node.id === "container-1");
  assert.equal(container?.kind, "container");
  if (!container || container.kind !== "container") return;
  assert.equal(container.children[0]?.kind, "heading");
  if (container.children[0]?.kind !== "heading") return;
  assert.equal(container.children[0].props.text, "Updated heading");
});

test("patchBuilderNodeProps rejects no-op patch payloads", () => {
  const patched = patchBuilderNodeProps({
    tree: fixtureTree(),
    nodeId: "container-1:heading",
    patch: { text: "Nested heading" },
  });
  assert.equal(patched.ok, false);
  if (patched.ok) return;
  assert.equal(patched.code, "INVALID_MOVE_TARGET");
  assert.match(patched.message, /No changes to apply/i);
  assert.ok(patched.issues?.some((issue) => issue.path === "target.patch"));
});

test("patchBuilderNodeProps returns validation failure for invalid patch", () => {
  const patched = patchBuilderNodeProps({
    tree: fixtureTree(),
    nodeId: "container-1:heading",
    patch: { text: "" },
  });
  assert.equal(patched.ok, false);
  if (patched.ok) return;
  assert.equal(patched.code, "VALIDATION_FAILED");
});

test("patchBuilderNodeProps updates advanced layout node props when valid", () => {
  const patched = patchBuilderNodeProps({
    tree: [
      {
        id: "container-root",
        kind: "container",
        props: {
          layout: "grid",
          columns: 4,
          responsive: {
            tablet: { columns: 2, layout: "grid" },
          },
        },
        children: [],
      },
    ],
    nodeId: "container-root",
    patch: {
      responsive: {
        tablet: { columns: 2, layout: "grid" },
        mobile: { columns: 1, layout: "stack", gap: "s" },
      },
    },
  });
  assert.equal(patched.ok, true);
  if (!patched.ok) return;
  assert.equal(patched.tree[0]?.kind, "container");
  if (patched.tree[0]?.kind !== "container") return;
  assert.equal(patched.tree[0].props.responsive?.mobile?.columns, 1);
  assert.equal(patched.tree[0].props.responsive?.mobile?.layout, "stack");
});

test("patchBuilderNodeProps treats nested-equal payload as no-op", () => {
  const patched = patchBuilderNodeProps({
    tree: [
      {
        id: "container-root",
        kind: "container",
        props: {
          layout: "grid",
          responsive: {
            tablet: { columns: 2, layout: "grid" },
          },
        },
        children: [],
      },
    ],
    nodeId: "container-root",
    patch: {
      responsive: {
        tablet: { columns: 2, layout: "grid" },
      },
    },
  });
  assert.equal(patched.ok, false);
  if (patched.ok) return;
  assert.equal(patched.code, "INVALID_MOVE_TARGET");
  assert.ok(patched.issues?.some((issue) => issue.path === "target.patch"));
});

test("patchBuilderNodeProps rejects invalid advanced layout props", () => {
  const patched = patchBuilderNodeProps({
    tree: [
      {
        id: "carousel-root",
        kind: "carousel",
        props: {
          slidesPerView: 2,
          autoplayMs: 6000,
        },
        children: [],
      },
    ],
    nodeId: "carousel-root",
    patch: { autoplayMs: 500 },
  });
  assert.equal(patched.ok, false);
  if (patched.ok) return;
  assert.equal(patched.code, "VALIDATION_FAILED");
});

test("patchBuilderNodeProps returns actionable missing-node issues", () => {
  const patched = patchBuilderNodeProps({
    tree: fixtureTree(),
    nodeId: "missing-node",
    patch: { text: "No-op" },
  });
  assert.equal(patched.ok, false);
  if (patched.ok) return;
  assert.equal(patched.code, "NODE_NOT_FOUND");
  assert.ok(patched.issues?.some((issue) => issue.path === "source.nodeId"));
});

test("removeBuilderNode removes target from parent list", () => {
  const removed = removeBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1:paragraph:subheadline",
  });
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  const section = removed.tree.find((node) => node.id === "section-1");
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  assert.equal(section.children?.length, 1);
  assert.equal(section.children?.[0]?.id, "section-1:heading:headline");
});

test("removeBuilderNode rejects removing the last accordion item", () => {
  const removed = removeBuilderNode({
    tree: [
      {
        id: "accordion-1",
        kind: "accordion",
        props: {},
        children: [
          {
            id: "accordion-item-1",
            kind: "accordion_item",
            props: { title: "Only question" },
            children: [
              {
                id: "answer-1",
                kind: "paragraph",
                props: { text: "Only answer" },
              },
            ],
          },
        ],
      },
    ],
    nodeId: "accordion-item-1",
  });
  assert.equal(removed.ok, false);
  if (removed.ok) return;
  assert.equal(removed.code, "INVALID_MOVE_TARGET");
  assert.ok(removed.issues?.some((issue) => issue.path === "source.group"));
});

test("duplicateBuilderNode duplicates a nested leaf after the source", () => {
  const duplicated = duplicateBuilderNode({
    tree: fixtureTree(),
    nodeId: "container-1:heading",
  });
  assert.equal(duplicated.ok, true);
  if (!duplicated.ok) return;
  const container = duplicated.tree.find((node) => node.id === "container-1");
  assert.equal(container?.kind, "container");
  if (!container || container.kind !== "container") return;
  assert.equal(container.children.length, 2);
  assert.equal(container.children[0]?.id, "container-1:heading");
  assert.equal(container.children[1]?.id, duplicated.nodeId);
  assert.notEqual(container.children[1]?.id, "container-1:heading");
  assert.equal(container.children[1]?.kind, "heading");
  if (container.children[1]?.kind !== "heading") return;
  assert.equal(container.children[1].props.text, "Nested heading");
});

test("duplicateBuilderNode gives nested descendants fresh ids and remaps defaults", () => {
  const tree: BuilderNodeTree = [
    {
      id: "tabs-1",
      kind: "tabs",
      props: { defaultTabId: "tab-1" },
      children: [
        {
          id: "tab-1",
          kind: "tab_panel",
          props: { title: "First" },
          children: [
            {
              id: "tab-1:heading",
              kind: "heading",
              props: { text: "Inside tab", level: 2 },
            },
          ],
        },
      ],
    },
  ];
  const duplicated = duplicateBuilderNode({
    tree,
    nodeId: "tabs-1",
  });
  assert.equal(duplicated.ok, true);
  if (!duplicated.ok) return;
  assert.equal(duplicated.tree.length, 2);
  const copy = duplicated.tree[1];
  assert.equal(copy?.kind, "tabs");
  if (!copy || copy.kind !== "tabs") return;
  assert.equal(copy.id, duplicated.nodeId);
  assert.notEqual(copy.id, "tabs-1");
  assert.equal(copy.children.length, 1);
  assert.notEqual(copy.children[0]?.id, "tab-1");
  assert.equal(copy.props.defaultTabId, copy.children[0]?.id);
  const copiedPanel = copy.children[0];
  assert.equal(copiedPanel?.kind, "tab_panel");
  if (!copiedPanel || copiedPanel.kind !== "tab_panel") return;
  assert.notEqual(copiedPanel.children[0]?.id, "tab-1:heading");
});

test("duplicateBuilderNode rejects section nodes", () => {
  const duplicated = duplicateBuilderNode({
    tree: fixtureTree(),
    nodeId: "section-1",
  });
  assert.equal(duplicated.ok, false);
  if (duplicated.ok) return;
  assert.equal(duplicated.code, "NODE_KIND_NOT_DUPLICABLE");
});

test("duplicateBuilderNode returns actionable missing-node issues", () => {
  const duplicated = duplicateBuilderNode({
    tree: fixtureTree(),
    nodeId: "missing-node",
  });
  assert.equal(duplicated.ok, false);
  if (duplicated.ok) return;
  assert.equal(duplicated.code, "NODE_NOT_FOUND");
  assert.ok(duplicated.issues?.some((issue) => issue.path === "source.nodeId"));
});

test("pasteBuilderNode inserts a copied node with fresh ids", () => {
  const pasted = pasteBuilderNode({
    tree: fixtureTree(),
    parentId: "container-1",
    index: 1,
    node: {
      id: "copied-split",
      kind: "split",
      props: { ratio: "50-50" },
      children: [
        {
          id: "copied-split:heading",
          kind: "heading",
          props: { text: "Copied headline", level: 2 },
        },
      ],
    },
  });
  assert.equal(pasted.ok, true);
  if (!pasted.ok) return;
  const container = pasted.tree.find((node) => node.id === "container-1");
  assert.equal(container?.kind, "container");
  if (!container || container.kind !== "container") return;
  const copy = container.children[1];
  assert.equal(copy?.kind, "split");
  if (!copy || copy.kind !== "split") return;
  assert.equal(copy.id, pasted.nodeId);
  assert.notEqual(copy.id, "copied-split");
  assert.notEqual(copy.children[0]?.id, "copied-split:heading");
});

test("pasteBuilderNode rejects disallowed parents", () => {
  const pasted = pasteBuilderNode({
    tree: fixtureTree(),
    parentId: "section-1:heading:headline",
    node: {
      id: "copied-paragraph",
      kind: "paragraph",
      props: { text: "Copied paragraph" },
    },
  });
  assert.equal(pasted.ok, false);
  if (pasted.ok) return;
  assert.equal(pasted.code, "PARENT_DOES_NOT_ALLOW_CHILDREN");
});

test("pasteBuilderNode rejects copied section nodes", () => {
  const pasted = pasteBuilderNode({
    tree: fixtureTree(),
    parentId: null,
    node: {
      id: "copied-section",
      kind: "section",
      props: {
        sectionId: "33333333-3333-4333-8333-333333333333",
        sectionTypeKey: "hero",
      },
    },
  });
  assert.equal(pasted.ok, false);
  if (pasted.ok) return;
  assert.equal(pasted.code, "NODE_KIND_NOT_DUPLICABLE");
});

test("applyBuilderNodeOperation returns a typed operation envelope", () => {
  const inserted = applyBuilderNodeOperation({
    operation: "insert",
    tree: fixtureTree(),
    parentId: "container-1",
    index: 1,
    node: {
      id: "inserted-paragraph",
      kind: "paragraph",
      props: { text: "Inserted" },
    },
  });
  assert.equal(inserted.ok, true);
  if (!inserted.ok) return;
  assert.equal(inserted.operation, "insert");
  const container = inserted.tree.find((node) => node.id === "container-1");
  assert.equal(container?.kind, "container");
  if (!container || container.kind !== "container") return;
  assert.equal(container.children[1]?.id, "inserted-paragraph");
});

test("applyBuilderNodeOperation preserves tree integrity after chained operations", () => {
  const base = fixtureTree();

  const inserted = applyBuilderNodeOperation({
    operation: "insert",
    tree: base,
    parentId: "container-1",
    node: {
      id: "flow-button",
      kind: "button",
      props: { label: "See roster", href: "/directory" },
    },
  });
  assert.equal(inserted.ok, true);
  if (!inserted.ok) return;

  const duplicated = applyBuilderNodeOperation({
    operation: "duplicate",
    tree: inserted.tree,
    nodeId: "flow-button",
  });
  assert.equal(duplicated.ok, true);
  if (!duplicated.ok) return;
  assert.ok(duplicated.nodeId);

  const moved = applyBuilderNodeOperation({
    operation: "move",
    tree: duplicated.tree,
    nodeId: duplicated.nodeId!,
    parentId: "section-1",
    index: 2,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;

  const patched = applyBuilderNodeOperation({
    operation: "patch",
    tree: moved.tree,
    nodeId: duplicated.nodeId!,
    patch: { label: "Book now" },
  });
  assert.equal(patched.ok, true);
  if (!patched.ok) return;

  const removed = applyBuilderNodeOperation({
    operation: "remove",
    tree: patched.tree,
    nodeId: "flow-button",
  });
  assert.equal(removed.ok, true);
  if (!removed.ok) return;

  const validation = validateBuilderNodeTree(removed.tree);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  const section = removed.tree.find((node) => node.id === "section-1");
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  const movedNode = section.children?.find((node) => node.id === duplicated.nodeId);
  assert.equal(movedNode?.kind, "button");
  if (!movedNode || movedNode.kind !== "button") return;
  assert.equal(movedNode.props.label, "Book now");
});

test("applyBuilderNodeOperation returns typed error envelopes without mutating source tree", () => {
  const base = fixtureTree();
  const snapshot = JSON.parse(JSON.stringify(base));

  const failedMove = applyBuilderNodeOperation({
    operation: "move",
    tree: base,
    nodeId: "section-1:heading:headline",
    parentId: "section-1:heading:headline",
    index: 0,
  });
  assert.equal(failedMove.ok, false);
  if (failedMove.ok) return;
  assert.equal(failedMove.operation, "move");
  assert.equal(failedMove.code, "INVALID_MOVE_TARGET");
  assert.ok(failedMove.message.length > 0);
  assert.deepEqual(base, snapshot);

  const failedRemove = applyBuilderNodeOperation({
    operation: "remove",
    tree: base,
    nodeId: "missing-node",
  });
  assert.equal(failedRemove.ok, false);
  if (failedRemove.ok) return;
  assert.equal(failedRemove.operation, "remove");
  assert.equal(failedRemove.code, "NODE_NOT_FOUND");
  assert.match(failedRemove.message, /was not found/i);
  assert.ok(failedRemove.issues?.some((issue) => issue.path === "source.nodeId"));
  assert.deepEqual(base, snapshot);

  const failedCrossParentMove = applyBuilderNodeOperation({
    operation: "move",
    tree: base,
    nodeId: "section-1",
    parentId: "container-1",
    index: 0,
  });
  assert.equal(failedCrossParentMove.ok, false);
  if (failedCrossParentMove.ok) return;
  assert.equal(failedCrossParentMove.operation, "move");
  assert.equal(failedCrossParentMove.code, "CHILD_KIND_NOT_ALLOWED");
  assert.match(failedCrossParentMove.message, /not allowed/i);
  assert.deepEqual(base, snapshot);
});

test("applyBuilderNodeOperation success path does not mutate source tree", () => {
  const base = fixtureTree();
  const snapshot = JSON.parse(JSON.stringify(base));
  const inserted = applyBuilderNodeOperation({
    operation: "insert",
    tree: base,
    parentId: "container-1",
    node: {
      id: "immutability-paragraph",
      kind: "paragraph",
      props: { text: "Immutable source test" },
    },
  });
  assert.equal(inserted.ok, true);
  assert.deepEqual(base, snapshot);
  if (!inserted.ok) return;
  const container = inserted.tree.find((node) => node.id === "container-1");
  assert.equal(container?.kind, "container");
  if (!container || container.kind !== "container") return;
  assert.ok(
    container.children.some((node) => node.id === "immutability-paragraph"),
  );
});

test("chained operation flow keeps duplicated id stable across move + patch + remove", () => {
  const base = fixtureTree();
  const duplicate = applyBuilderNodeOperation({
    operation: "duplicate",
    tree: base,
    nodeId: "container-1:heading",
  });
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) return;
  assert.ok(duplicate.nodeId);
  const duplicatedNodeId = duplicate.nodeId!;

  const moved = applyBuilderNodeOperation({
    operation: "move",
    tree: duplicate.tree,
    nodeId: duplicatedNodeId,
    parentId: "section-1",
    index: 2,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;

  const patched = applyBuilderNodeOperation({
    operation: "patch",
    tree: moved.tree,
    nodeId: duplicatedNodeId,
    patch: { text: "Promoted nested heading" },
  });
  assert.equal(patched.ok, true);
  if (!patched.ok) return;

  const removed = applyBuilderNodeOperation({
    operation: "remove",
    tree: patched.tree,
    nodeId: duplicatedNodeId,
  });
  assert.equal(removed.ok, true);
  if (!removed.ok) return;

  const section = removed.tree.find((node) => node.id === "section-1");
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  assert.equal(
    section.children?.some((node) => node.id === duplicatedNodeId),
    false,
  );

  const validation = validateBuilderNodeTree(removed.tree);
  assert.equal(validation.ok, true);
});

// ── #55 resilience: a single pre-existing corrupt node must NOT make the
//    whole tree uneditable ──────────────────────────────────────────────
//
// Classic trigger: a legacy `section` whose `sectionId` is not a UUID (old
// seed data). It fails validation, but it must not block edits elsewhere —
// otherwise the editor can't even delete it (every structural op re-validates
// the whole tree and trips on the same node).
function treeWithCorruptSectionSibling(): BuilderNodeTree {
  return [
    {
      id: "section-corrupt",
      kind: "section",
      props: {
        sectionId: "legacy-not-a-uuid", // fails z.string().uuid()
        sectionTypeKey: "hero",
        slotKey: "body",
        sortOrder: 0,
      },
      children: [],
    },
    {
      id: "container-ok",
      kind: "container",
      props: { layout: "stack", gap: "m" },
      children: [
        {
          id: "container-ok:heading",
          kind: "heading",
          props: { text: "Still editable", level: 2 },
        },
      ],
    },
  ];
}

test("insertBuilderNode is not blocked by a pre-existing corrupt sibling and heals the tree", () => {
  const original = treeWithCorruptSectionSibling();
  // Precondition: the input really is corrupt (this is the bug's trigger).
  assert.equal(validateBuilderNodeTree(original).ok, false);

  const inserted = insertBuilderNode({
    tree: original,
    parentId: "container-ok",
    node: {
      id: "container-ok:new-heading",
      kind: "heading",
      props: { text: "Added despite corruption", level: 3 },
    },
  });

  assert.equal(inserted.ok, true);
  if (!inserted.ok) return;
  // Result is a valid (repaired) tree...
  assert.equal(validateBuilderNodeTree(inserted.tree).ok, true);
  // ...the corrupt section was dropped...
  assert.equal(
    inserted.tree.some((node) => node.id === "section-corrupt"),
    false,
  );
  // ...and the user's new node landed inside the surviving container.
  const container = inserted.tree.find((node) => node.id === "container-ok");
  assert.equal(container?.kind, "container");
  if (!container || container.kind !== "container") return;
  assert.equal(
    container.children.some((node) => node.id === "container-ok:new-heading"),
    true,
  );
});

test("removeBuilderNode can delete the corrupt node that was blocking edits", () => {
  const removed = removeBuilderNode({
    tree: treeWithCorruptSectionSibling(),
    nodeId: "section-corrupt",
  });
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(validateBuilderNodeTree(removed.tree).ok, true);
  assert.equal(
    removed.tree.some((node) => node.id === "section-corrupt"),
    false,
  );
});

test("patchBuilderNodeProps still rejects a patch that introduces NEW corruption, even with a pre-existing corrupt sibling", () => {
  const patched = patchBuilderNodeProps({
    tree: treeWithCorruptSectionSibling(),
    nodeId: "container-ok:heading",
    patch: { text: "" }, // empty text fails headingPropsSchema → net-new issue
  });
  assert.equal(patched.ok, false);
  if (patched.ok) return;
  assert.equal(patched.code, "VALIDATION_FAILED");
});
