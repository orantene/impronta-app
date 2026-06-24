import assert from "node:assert/strict";
import test from "node:test";

import {
  AddGalleryForbiddenInsertError,
  addGalleryItemTargetsDirectory,
  applyNativeVariant,
  assertAddGalleryBuilderTreeOnly,
  createDbTemplateNodeForGalleryItem,
  createNativeNodeForGalleryItem,
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

test("D7 — dbTemplate insert stamps __sourceTemplateId provenance on the root node", () => {
  const action = resolveAddGalleryInsertAction(dbTemplateItem);
  assert.equal(action.type, "dbTemplate");
  if (action.type === "dbTemplate") {
    assert.equal(
      (action.node.props as Record<string, unknown>).__sourceTemplateId,
      "abc",
    );
  }
});

test("D7 — native node inserts carry NO __sourceTemplateId (no template provenance)", () => {
  const action = resolveAddGalleryInsertAction(baseItem);
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    assert.equal(
      (action.node.props as Record<string, unknown>).__sourceTemplateId,
      undefined,
    );
  }
});

test("dbTemplate with an empty tree yields an editable empty container (never throws)", () => {
  const empty: AddGalleryItem = { ...dbTemplateItem, dbTemplateTree: [] };
  const node = createDbTemplateNodeForGalleryItem(empty);
  assert.equal(node.kind, "container");
  assert.deepEqual((node as { children?: BuilderNode[] }).children, []);
});

// ── WS-C per-prop locking — admin-locked props are stamped at insert ──────────

test("resolveAddGalleryInsertAction stamps item.lockedProps onto the node + carrier", () => {
  const locked: AddGalleryItem = { ...baseItem, lockedProps: ["style.textColor", "tone"] };
  const action = resolveAddGalleryInsertAction(locked);
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    // Base field set so the inspector lock gate sees it.
    assert.deepEqual(action.node.lockedProps, ["style.textColor", "tone"]);
    // Carrier mirror in props so it round-trips through validate/persist.
    assert.deepEqual(
      (action.node.props as { lockedProps?: string[] }).lockedProps,
      ["style.textColor", "tone"],
    );
  }
});

test("resolveAddGalleryInsertAction leaves the node untouched when no locks", () => {
  const action = resolveAddGalleryInsertAction(baseItem);
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    assert.equal(action.node.lockedProps, undefined);
    assert.equal((action.node.props as { lockedProps?: string[] }).lockedProps, undefined);
  }
});

test("dbTemplate insert also carries admin locks", () => {
  const locked: AddGalleryItem = { ...dbTemplateItem, lockedProps: ["layout"] };
  const action = resolveAddGalleryInsertAction(locked);
  assert.equal(action.type, "dbTemplate");
  if (action.type === "dbTemplate") {
    assert.deepEqual(action.node.lockedProps, ["layout"]);
  }
});

// ── WS-C C2 — admin default props are merged onto the inserted node ────────────

test("resolveAddGalleryInsertAction deep-merges item.defaultProps onto the node", () => {
  // The paragraph native default has no `style`; the admin default sets one and
  // overrides text. Variant resolution runs first, then defaults merge over it.
  const withDefaults: AddGalleryItem = {
    ...baseItem,
    defaultProps: { text: "Admin copy", style: { tone: "muted", size: "lg" } },
  };
  const action = resolveAddGalleryInsertAction(withDefaults);
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    const props = action.node.props as { text?: string; style?: Record<string, unknown> };
    assert.equal(props.text, "Admin copy");
    assert.deepEqual(props.style, { tone: "muted", size: "lg" });
  }
});

test("resolveAddGalleryInsertAction applies defaults BEFORE stamping locks (locks ride on top)", () => {
  const both: AddGalleryItem = {
    ...baseItem,
    defaultProps: { text: "Locked baseline", tone: "primary" },
    lockedProps: ["tone"],
  };
  const action = resolveAddGalleryInsertAction(both);
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    const props = action.node.props as {
      text?: string;
      tone?: string;
      lockedProps?: string[];
    };
    // Default value is present (the canonical first-save baseline for the lock)…
    assert.equal(props.tone, "primary");
    assert.equal(props.text, "Locked baseline");
    // …and the lock carrier stamped on top.
    assert.deepEqual(action.node.lockedProps, ["tone"]);
    assert.deepEqual(props.lockedProps, ["tone"]);
  }
});

test("resolveAddGalleryInsertAction leaves the node untouched when no defaultProps", () => {
  const action = resolveAddGalleryInsertAction(baseItem);
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    // Paragraph native default — no admin text/style injected.
    const props = action.node.props as { text?: string; style?: unknown };
    assert.equal(props.style, undefined);
  }
});

test("dbTemplate insert also applies admin defaultProps onto the root node", () => {
  const withDefaults: AddGalleryItem = {
    ...dbTemplateItem,
    defaultProps: { layerLabel: "Admin label", gap: "l" },
  };
  const action = resolveAddGalleryInsertAction(withDefaults);
  assert.equal(action.type, "dbTemplate");
  if (action.type === "dbTemplate") {
    const props = action.node.props as { layerLabel?: string; gap?: string; layout?: string };
    assert.equal(props.layerLabel, "Admin label");
    assert.equal(props.gap, "l");
    // The template's own root props survive the merge.
    assert.equal(props.layout, "stack");
  }
});

// ── WS-C C3 — variant persistence + admin default_variant ─────────────────────

const headingItem: AddGalleryItem = {
  ...baseItem,
  id: "heading",
  nativeKind: "heading",
};

test("applyNativeVariant applies a variant's preset props (exported for the inspector)", () => {
  const node = { id: "h", kind: "heading", props: {} } as unknown as BuilderNode;
  const titled = applyNativeVariant(node, "title");
  const props = titled.props as { text?: string; level?: number };
  assert.equal(props.text, "Title");
  assert.equal(props.level, 1);
});

test("createNativeNodeForGalleryItem records an explicit nativeVariant on the node", () => {
  const item: AddGalleryItem = { ...headingItem, nativeVariant: "subtitle" };
  const node = createNativeNodeForGalleryItem(item);
  const props = node.props as { nativeVariant?: string; level?: number };
  assert.equal(props.nativeVariant, "subtitle");
  // Variant preset applied (subtitle → level 2).
  assert.equal(props.level, 2);
});

test("createNativeNodeForGalleryItem honors admin default_variant when no explicit variant", () => {
  const item: AddGalleryItem = { ...headingItem, defaultVariant: "title" };
  const node = createNativeNodeForGalleryItem(item);
  const props = node.props as { nativeVariant?: string; text?: string };
  assert.equal(props.nativeVariant, "title");
  assert.equal(props.text, "Title");
});

test("explicit nativeVariant WINS over admin default_variant", () => {
  const item: AddGalleryItem = {
    ...headingItem,
    nativeVariant: "subtitle",
    defaultVariant: "title",
  };
  const node = createNativeNodeForGalleryItem(item);
  const props = node.props as { nativeVariant?: string; level?: number };
  assert.equal(props.nativeVariant, "subtitle");
  assert.equal(props.level, 2);
});

test("createNativeNodeForGalleryItem records NO variant for the default (clean baseline)", () => {
  const node = createNativeNodeForGalleryItem(headingItem);
  assert.equal((node.props as { nativeVariant?: string }).nativeVariant, undefined);
});

test("resolveAddGalleryInsertAction persists the variant through the composer", () => {
  const action = resolveAddGalleryInsertAction({
    ...headingItem,
    nativeVariant: "title",
  });
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    assert.equal((action.node.props as { nativeVariant?: string }).nativeVariant, "title");
  }
});

// ── WS-C C4 — data-source defaults merged into props.dataBinding at insert ─────

const CONNECTED_TREE: BuilderNode[] = [
  {
    id: "tpl-grid",
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: { sourceKey: "talent_roster", maxItems: 12 },
    },
    children: [],
  } as unknown as BuilderNode,
];

const connectedDbItem: AddGalleryItem = {
  ...dbTemplateItem,
  id: "db-template:connected",
  dbTemplateTree: CONNECTED_TREE,
};

test("resolveAddGalleryInsertAction merges dataSourceDefaults into props.dataBinding", () => {
  const action = resolveAddGalleryInsertAction({
    ...connectedDbItem,
    dataSourceDefaults: { maxItems: 6, pinnedIds: ["a", "b"] },
  });
  assert.equal(action.type, "dbTemplate");
  if (action.type === "dbTemplate") {
    const binding = (action.node.props as {
      dataBinding: { sourceKey?: string; maxItems?: number; pinnedIds?: unknown[] };
    }).dataBinding;
    assert.equal(binding.sourceKey, "talent_roster"); // existing key survives
    assert.equal(binding.maxItems, 6); // admin default wins
    assert.deepEqual(binding.pinnedIds, ["a", "b"]); // array taken wholesale
  }
});

test("dataSourceDefaults is a no-op when absent", () => {
  const action = resolveAddGalleryInsertAction(connectedDbItem);
  assert.equal(action.type, "dbTemplate");
  if (action.type === "dbTemplate") {
    const binding = (action.node.props as {
      dataBinding: { maxItems?: number };
    }).dataBinding;
    assert.equal(binding.maxItems, 12); // unchanged from the template
  }
});

test("dataSourceDefaults is a no-op on a node with no dataBinding (static native)", () => {
  const action = resolveAddGalleryInsertAction({
    ...headingItem,
    dataSourceDefaults: { maxItems: 4 },
  });
  assert.equal(action.type, "nativeNode");
  if (action.type === "nativeNode") {
    assert.equal((action.node.props as { dataBinding?: unknown }).dataBinding, undefined);
  }
});

// ── Directory plan-gating cap (add path) ────────────────────────────────────

test("addGalleryItemTargetsDirectory only matches the directory embed/connected items", () => {
  assert.equal(
    addGalleryItemTargetsDirectory({
      insertMethod: "sectionEmbed",
      sectionEmbedKey: "directory",
    }),
    true,
  );
  assert.equal(
    addGalleryItemTargetsDirectory({
      insertMethod: "connectedNode",
      sectionEmbedKey: "directory",
    }),
    true,
  );
  // Wrong embed key → not a directory add.
  assert.equal(
    addGalleryItemTargetsDirectory({
      insertMethod: "sectionEmbed",
      sectionEmbedKey: "hero_search",
    }),
    false,
  );
  // A directory-FLAVORED template (sectionTemplate) is freeform, not the
  // gated dynamic embed → not capped.
  assert.equal(
    addGalleryItemTargetsDirectory({
      insertMethod: "sectionTemplate",
      sectionEmbedKey: "directory",
    }),
    false,
  );
  // Plain native node → never a directory add.
  assert.equal(
    addGalleryItemTargetsDirectory({
      insertMethod: "nativeNode",
      sectionEmbedKey: undefined,
    }),
    false,
  );
});
