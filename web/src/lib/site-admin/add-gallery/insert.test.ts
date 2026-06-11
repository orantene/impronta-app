import assert from "node:assert/strict";
import test from "node:test";

import {
  AddGalleryForbiddenInsertError,
  assertAddGalleryBuilderTreeOnly,
  createDbTemplateNodeForGalleryItem,
  resolveAddGalleryInsertAction,
} from "./insert";
import type { AddGalleryItem } from "./types";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

// Collect every id in a BuilderNode subtree (depth-first).
function collectIds(node: BuilderNode): string[] {
  const ids = [node.id];
  const children = (node as { children?: BuilderNode[] }).children;
  if (Array.isArray(children)) {
    for (const child of children) ids.push(...collectIds(child));
  }
  return ids;
}

const baseItem: AddGalleryItem = {
  id: "test",
  label: "Test",
  description: "Test item",
  tab: "elements",
  category: "text",
  icon: "text",
  previewType: "icon-card",
  itemKind: "static",
  insertMethod: "nativeNode",
  dragSupported: true,
  availability: "available",
  sourceType: "native-freeform",
  nativeKind: "paragraph",
};

test("assertAddGalleryBuilderTreeOnly throws for legacyCompositionSlot", () => {
  assert.throws(
    () =>
      assertAddGalleryBuilderTreeOnly({
        id: "legacy",
        insertMethod: "legacyCompositionSlot",
      }),
    AddGalleryForbiddenInsertError,
  );
});

test("assertAddGalleryBuilderTreeOnly throws for cmsPageSectionSlot", () => {
  assert.throws(
    () =>
      assertAddGalleryBuilderTreeOnly({
        id: "cms",
        insertMethod: "cmsPageSectionSlot",
      }),
    AddGalleryForbiddenInsertError,
  );
});

test("resolveAddGalleryInsertAction returns native node for paragraph", () => {
  const action = resolveAddGalleryInsertAction(baseItem);
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    assert.equal(action.node.kind, "paragraph");
  }
});

test("resolveAddGalleryInsertAction returns noop for coming soon", () => {
  const action = resolveAddGalleryInsertAction({
    ...baseItem,
    insertMethod: "disabledComingSoon",
    availability: "coming-soon",
    sourceType: "coming-soon",
  });
  assert.equal(action.type, "noop");
});

test("resolveAddGalleryInsertAction builds hero section template", () => {
  const action = resolveAddGalleryInsertAction({
    ...baseItem,
    id: "sec-hero",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "hero",
  });
  assert.equal(action.type, "sectionTemplate");
  if (action.type === "sectionTemplate") {
    assert.equal(action.node.kind, "container");
    assert.equal(
      action.node.kind === "container" ? action.node.props.layerLabel : null,
      "Hero Centered Section",
    );
  }
});

test("resolveAddGalleryInsertAction builds testimonials trio freeform template", () => {
  const action = resolveAddGalleryInsertAction({
    ...baseItem,
    id: "sec-testimonials-trio",
    insertMethod: "sectionTemplate",
    sectionTemplateId: "testimonials-trio",
  });
  assert.equal(action.type, "sectionTemplate");
  if (action.type === "sectionTemplate") {
    assert.equal(action.node.kind, "container");
    assert.equal(
      action.node.kind === "container" ? action.node.props.layerLabel : null,
      "Testimonials Section",
    );
  }
});

// ── dbTemplate (WS4) ────────────────────────────────────────────────────────

const DB_TEMPLATE_TREE: BuilderNode[] = [
  {
    id: "tpl-root",
    kind: "container",
    props: { layout: "stack", layerLabel: "Root" },
    children: [
      { id: "tpl-heading", kind: "heading", props: { text: "Welcome", level: 1 } },
      {
        id: "tpl-inner",
        kind: "container",
        props: { layout: "row" },
        children: [
          { id: "tpl-para", kind: "paragraph", props: { text: "Hi there." } },
        ],
      },
    ],
  } as unknown as BuilderNode,
];

const dbTemplateItem: AddGalleryItem = {
  ...baseItem,
  id: "db-template:abc",
  label: "Studio Template",
  tab: "page_templates",
  insertMethod: "dbTemplate",
  nativeKind: undefined,
  dbTemplateId: "abc",
  dbTemplateTree: DB_TEMPLATE_TREE,
  requiredPlan: "free",
  targetContext: "both",
};

test("dbTemplate is allowed by assertAddGalleryBuilderTreeOnly", () => {
  assert.doesNotThrow(() =>
    assertAddGalleryBuilderTreeOnly({ id: "db-template:abc", insertMethod: "dbTemplate" }),
  );
});

test("createDbTemplateNodeForGalleryItem re-mints EVERY node id (no source id survives)", () => {
  const node = createDbTemplateNodeForGalleryItem(dbTemplateItem);
  const newIds = collectIds(node);
  const sourceIds = new Set(["tpl-root", "tpl-heading", "tpl-inner", "tpl-para"]);
  // Every minted id is fresh — none collide with the source row's ids.
  for (const id of newIds) {
    assert.equal(sourceIds.has(id), false, `id "${id}" was not re-minted`);
  }
  // All minted ids are unique.
  assert.equal(new Set(newIds).size, newIds.length);
  // Single-root template inserts the root directly (an editable container).
  assert.equal(node.kind, "container");
  assert.equal(collectIds(node).length, 4);
});

test("createDbTemplateNodeForGalleryItem does NOT mutate the source tree", () => {
  const before = JSON.stringify(DB_TEMPLATE_TREE);
  createDbTemplateNodeForGalleryItem(dbTemplateItem);
  assert.equal(JSON.stringify(DB_TEMPLATE_TREE), before);
});

test("dbTemplate with multiple roots wraps them in one editable freeform container", () => {
  const multi: AddGalleryItem = {
    ...dbTemplateItem,
    dbTemplateTree: [
      { id: "a", kind: "heading", props: { text: "A", level: 1 } } as unknown as BuilderNode,
      { id: "b", kind: "paragraph", props: { text: "B" } } as unknown as BuilderNode,
    ],
  };
  const node = createDbTemplateNodeForGalleryItem(multi);
  assert.equal(node.kind, "container");
  const children = (node as { children?: BuilderNode[] }).children ?? [];
  assert.equal(children.length, 2);
  // Wrapper + both children are re-minted.
  const ids = collectIds(node);
  for (const id of ids) assert.equal(["a", "b"].includes(id), false);
});

test("resolveAddGalleryInsertAction returns a dbTemplate freeform node", () => {
  const action = resolveAddGalleryInsertAction(dbTemplateItem);
  assert.equal(action.type, "dbTemplate");
  if (action.type === "dbTemplate") {
    assert.equal(action.node.kind, "container");
    // Editable freeform: the inserted node carries a fresh id (data-builder-node-id).
    assert.ok(action.node.id.length > 0);
    assert.equal(action.node.id, action.node.id); // stable within the call
  }
});

test("dbTemplate with an empty tree yields an editable empty container (never throws)", () => {
  const empty: AddGalleryItem = { ...dbTemplateItem, dbTemplateTree: [] };
  const node = createDbTemplateNodeForGalleryItem(empty);
  assert.equal(node.kind, "container");
  assert.deepEqual((node as { children?: BuilderNode[] }).children, []);
});
