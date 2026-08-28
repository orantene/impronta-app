import assert from "node:assert/strict";
import test from "node:test";

import {
  applyKindGovernanceAtInsert,
  governRawInsertNode,
  governSectionEmbedNode,
  kindGovernanceIsEmpty,
  resolveKindGovernance,
  resolveSectionEmbedGovernance,
  type KindGovernance,
} from "./kind-governance";
import { createBuilderNode } from "@/lib/site-admin/builder-node/create";
import { createBuilderSectionEmbed } from "@/lib/site-admin/builder-node/section-embed-presets";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { AddGalleryItem } from "./types";
import { ADD_GALLERY_ITEMS } from "./registry";

// ── fixtures ──────────────────────────────────────────────────────────────────

const baseItem: AddGalleryItem = {
  id: "el-text",
  label: "Text",
  description: "A paragraph",
  tab: "blocks",
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

function rawNode(kind: BuilderNode["kind"], props: Record<string, unknown>): BuilderNode {
  return { id: "n1", kind, props } as unknown as BuilderNode;
}

// ── kindGovernanceIsEmpty ──────────────────────────────────────────────────────

test("kindGovernanceIsEmpty: null / undefined / all-empty are empty", () => {
  assert.equal(kindGovernanceIsEmpty(null), true);
  assert.equal(kindGovernanceIsEmpty(undefined), true);
  assert.equal(kindGovernanceIsEmpty({}), true);
  assert.equal(
    kindGovernanceIsEmpty({ lockedProps: [], defaultProps: {}, dataSourceDefaults: {} }),
    true,
  );
});

test("kindGovernanceIsEmpty: any non-empty field makes it non-empty", () => {
  assert.equal(kindGovernanceIsEmpty({ lockedProps: ["text"] }), false);
  assert.equal(kindGovernanceIsEmpty({ defaultProps: { text: "Hi" } }), false);
  assert.equal(kindGovernanceIsEmpty({ dataSourceDefaults: { maxItems: 3 } }), false);
});

// ── resolveKindGovernance ──────────────────────────────────────────────────────

test("resolveKindGovernance: returns the plain native item's overlay for the kind", () => {
  const items: AddGalleryItem[] = [
    { ...baseItem, lockedProps: ["text"], defaultProps: { text: "Locked copy" } },
  ];
  const g = resolveKindGovernance("paragraph", items);
  assert.ok(g);
  assert.deepEqual(g!.lockedProps, ["text"]);
  assert.deepEqual(g!.defaultProps, { text: "Locked copy" });
});

test("resolveKindGovernance: null when no item matches the kind", () => {
  const items: AddGalleryItem[] = [
    { ...baseItem, lockedProps: ["text"] },
  ];
  assert.equal(resolveKindGovernance("button", items), null);
});

test("resolveKindGovernance: null when the matching item carries no governance", () => {
  // el-text with no overlay fields ⇒ ungoverned ⇒ resolver returns null so the
  // caller short-circuits to the byte-identical raw node.
  assert.equal(resolveKindGovernance("paragraph", [baseItem]), null);
});

test("resolveKindGovernance: matches ONLY the plain (no-variant) item, not a variant card", () => {
  // Two paragraph cards: the plain el-text (governed) and a variant el-caption
  // (governed differently). A raw paragraph insert must pick the PLAIN one.
  const items: AddGalleryItem[] = [
    { ...baseItem, id: "el-text", lockedProps: ["text"] },
    {
      ...baseItem,
      id: "el-caption",
      nativeVariant: "caption",
      lockedProps: ["style"],
      defaultProps: { style: { size: "sm" } },
    },
  ];
  const g = resolveKindGovernance("paragraph", items);
  assert.ok(g);
  assert.deepEqual(g!.lockedProps, ["text"]);
  assert.equal(g!.defaultProps ?? null, null);
});

test("resolveKindGovernance: kind that exists ONLY as a variant card is ungoverned (null)", () => {
  // cta_group only ships as the "button-group" variant — there is no plain card,
  // so a bare kind-insert of cta_group stays ungoverned.
  const items: AddGalleryItem[] = [
    {
      ...baseItem,
      id: "el-button-group",
      nativeKind: "cta_group",
      nativeVariant: "button-group",
      lockedProps: ["layout"],
    },
  ];
  assert.equal(resolveKindGovernance("cta_group", items), null);
});

test('resolveKindGovernance: treats nativeVariant "default" as the plain item', () => {
  const items: AddGalleryItem[] = [
    { ...baseItem, nativeVariant: "default", lockedProps: ["text"] },
  ];
  const g = resolveKindGovernance("paragraph", items);
  assert.ok(g);
  assert.deepEqual(g!.lockedProps, ["text"]);
});

// ── applyKindGovernanceAtInsert ────────────────────────────────────────────────

test("applyKindGovernanceAtInsert: stamps lockedProps onto props + node", () => {
  const node = rawNode("paragraph", { text: "Paragraph" });
  const out = applyKindGovernanceAtInsert(node, { lockedProps: ["text"] });
  assert.deepEqual(out.lockedProps, ["text"]);
  assert.deepEqual((out.props as Record<string, unknown>).lockedProps, ["text"]);
});

test("applyKindGovernanceAtInsert: merges defaultProps OVER the node props (deep)", () => {
  const node = rawNode("paragraph", { text: "Paragraph", style: { size: "md" } });
  const out = applyKindGovernanceAtInsert(node, {
    defaultProps: { text: "Admin default", style: { tone: "muted" } },
  });
  assert.deepEqual(out.props, {
    text: "Admin default",
    style: { size: "md", tone: "muted" },
  });
});

test("applyKindGovernanceAtInsert: defaults first, then locks (locked baseline = admin default)", () => {
  const node = rawNode("paragraph", { text: "Paragraph" });
  const out = applyKindGovernanceAtInsert(node, {
    defaultProps: { text: "Admin default" },
    lockedProps: ["text"],
  });
  // The locked prop's first-save baseline is the admin default, not the raw value.
  assert.equal((out.props as Record<string, unknown>).text, "Admin default");
  assert.deepEqual(out.lockedProps, ["text"]);
});

test("applyKindGovernanceAtInsert: empty/absent governance returns the SAME reference", () => {
  const node = rawNode("paragraph", { text: "Paragraph" });
  assert.equal(applyKindGovernanceAtInsert(node, null), node);
  assert.equal(applyKindGovernanceAtInsert(node, undefined), node);
  assert.equal(applyKindGovernanceAtInsert(node, {}), node);
  assert.equal(
    applyKindGovernanceAtInsert(node, { lockedProps: [], defaultProps: {} }),
    node,
  );
});

test("applyKindGovernanceAtInsert: dataSourceDefaults only bind onto a node WITH a dataBinding", () => {
  const staticNode = rawNode("paragraph", { text: "Paragraph" });
  const boundNode = rawNode("section_embed", {
    dataBinding: { sourceKey: "talents" },
  });
  // No dataBinding ⇒ no-op (same reference) even though defaults are present.
  assert.equal(
    applyKindGovernanceAtInsert(staticNode, { dataSourceDefaults: { maxItems: 3 } }),
    staticNode,
  );
  // Has dataBinding ⇒ merged in.
  const out = applyKindGovernanceAtInsert(boundNode, {
    dataSourceDefaults: { maxItems: 3 },
  });
  assert.deepEqual((out.props as Record<string, unknown>).dataBinding, {
    sourceKey: "talents",
    maxItems: 3,
  });
});

// ── governRawInsertNode (the chokepoint call) ──────────────────────────────────

test("governRawInsertNode: a GOVERNED kind stamps locks + merges defaults", () => {
  const items: AddGalleryItem[] = [
    {
      ...baseItem,
      nativeKind: "button",
      lockedProps: ["tone"],
      defaultProps: { tone: "secondary" },
    },
    // adjust the matching item to the button kind for this case
  ];
  const node = createBuilderNode("button");
  const out = governRawInsertNode(node, "button", items);
  assert.deepEqual(out.lockedProps, ["tone"]);
  assert.equal((out.props as Record<string, unknown>).tone, "secondary");
});

test("governRawInsertNode: an UNGOVERNED kind is byte-identical to createBuilderNode(kind)", () => {
  // No overlay anywhere ⇒ the raw node is returned unchanged (same reference),
  // so the core insert path behaves EXACTLY as today.
  const node = createBuilderNode("heading");
  const out = governRawInsertNode(node, "heading", []);
  assert.equal(out, node);
  // And deep-equal to a fresh createBuilderNode of the same kind, modulo id.
  const fresh = createBuilderNode("heading");
  assert.deepEqual({ ...out, id: "x" }, { ...fresh, id: "x" });
});

test("governRawInsertNode: a governed-but-other-kind overlay does NOT touch an ungoverned kind", () => {
  const items: AddGalleryItem[] = [
    { ...baseItem, nativeKind: "paragraph", lockedProps: ["text"] },
  ];
  // Inserting a heading must be untouched — only paragraph is governed.
  const node = createBuilderNode("heading");
  const out = governRawInsertNode(node, "heading", items);
  assert.equal(out, node);
});

// Static type smoke: KindGovernance is exported + shaped.
test("KindGovernance type is usable", () => {
  const g: KindGovernance = { lockedProps: ["x"] };
  assert.ok(g.lockedProps);
});

// ── REAL registry (regression guard for the variant-canonical mismatch) ───────
// These use ADD_GALLERY_ITEMS so a wrong kind→item assumption can't pass on a
// hand-mocked item. el-button is `nativeKind:"button"` + `nativeVariant:"button"`
// (NOT no-variant) — the live-QA bug where resolveKindGovernance returned null.

test("resolveKindGovernance: REAL el-button (self-named variant) governs kind 'button'", () => {
  const items = ADD_GALLERY_ITEMS.map((it) =>
    it.id === "el-button"
      ? { ...it, lockedProps: ["tone"], defaultProps: { label: "Brand CTA" } }
      : it,
  );
  const g = resolveKindGovernance("button", items);
  assert.ok(g, "kind 'button' must resolve governance from el-button");
  assert.deepEqual(g!.lockedProps, ["tone"]);
  assert.deepEqual(g!.defaultProps, { label: "Brand CTA" });
});

test("resolveKindGovernance: REAL el-text (no-variant) governs kind 'paragraph'", () => {
  const items = ADD_GALLERY_ITEMS.map((it) =>
    it.id === "el-text" ? { ...it, lockedProps: ["style.textColor"] } : it,
  );
  const g = resolveKindGovernance("paragraph", items);
  assert.ok(g);
  assert.deepEqual(g!.lockedProps, ["style.textColor"]);
});

test("resolveKindGovernance: REAL registry, no overlay ⇒ null (byte-identical insert)", () => {
  assert.equal(resolveKindGovernance("button", ADD_GALLERY_ITEMS), null);
  assert.equal(resolveKindGovernance("paragraph", ADD_GALLERY_ITEMS), null);
});

// ── resolveSectionEmbedGovernance (Gap 1 — the curated embed path) ─────────────

const embedItem: AddGalleryItem = {
  id: "el-search-bar",
  label: "Directory",
  description: "Searchable talent directory",
  tab: "data",
  category: "directory",
  icon: "search",
  previewType: "icon-card",
  itemKind: "connected",
  insertMethod: "sectionEmbed",
  dragSupported: true,
  availability: "available",
  sourceType: "section-embed",
  sectionEmbedKey: "directory",
};

test("resolveSectionEmbedGovernance: returns the embed item's overlay for the key", () => {
  const items: AddGalleryItem[] = [
    { ...embedItem, lockedProps: ["config.heading"], defaultProps: { config: { heading: "Find talent" } } },
  ];
  const g = resolveSectionEmbedGovernance("directory", items);
  assert.ok(g);
  assert.deepEqual(g!.lockedProps, ["config.heading"]);
  assert.deepEqual(g!.defaultProps, { config: { heading: "Find talent" } });
});

test("resolveSectionEmbedGovernance: null when no embed item matches the key", () => {
  const items: AddGalleryItem[] = [{ ...embedItem, lockedProps: ["config.heading"] }];
  assert.equal(resolveSectionEmbedGovernance("booking_widget", items), null);
});

test("resolveSectionEmbedGovernance: null when the matching embed carries no governance", () => {
  // An ungoverned embed item ⇒ null so the embed insert is byte-identical.
  assert.equal(resolveSectionEmbedGovernance("directory", [embedItem]), null);
});

test("resolveSectionEmbedGovernance: matches a connectedNode item on the same key", () => {
  const items: AddGalleryItem[] = [
    {
      ...embedItem,
      id: "cn-directory",
      insertMethod: "connectedNode",
      lockedProps: ["config.maxItems"],
    },
  ];
  const g = resolveSectionEmbedGovernance("directory", items);
  assert.ok(g);
  assert.deepEqual(g!.lockedProps, ["config.maxItems"]);
});

test("resolveSectionEmbedGovernance: a GOVERNED sibling wins over an ungoverned one on the same key", () => {
  const items: AddGalleryItem[] = [
    { ...embedItem, id: "el-search-bar" }, // ungoverned
    { ...embedItem, id: "el-search-bar-2", lockedProps: ["config.heading"] }, // governed
  ];
  const g = resolveSectionEmbedGovernance("directory", items);
  assert.ok(g);
  assert.deepEqual(g!.lockedProps, ["config.heading"]);
});

test("resolveSectionEmbedGovernance: a nativeNode item with the same key is IGNORED", () => {
  // Only sectionEmbed / connectedNode items govern an embed insert.
  const items: AddGalleryItem[] = [
    { ...embedItem, insertMethod: "nativeNode", nativeKind: "section_embed", lockedProps: ["config.x"] },
  ];
  assert.equal(resolveSectionEmbedGovernance("directory", items), null);
});

// ── governSectionEmbedNode (the embed chokepoint call) ─────────────────────────

test("governSectionEmbedNode: a GOVERNED embed stamps locks + merges defaults onto the embed node", () => {
  const items: AddGalleryItem[] = [
    {
      ...embedItem,
      lockedProps: ["config.heading"],
      defaultProps: { config: { heading: "Find talent" } },
    },
  ];
  const node = createBuilderSectionEmbed("directory");
  const out = governSectionEmbedNode(node, "directory", items);
  assert.deepEqual(out.lockedProps, ["config.heading"]);
  const props = out.props as Record<string, unknown>;
  assert.deepEqual(props.lockedProps, ["config.heading"]);
  // defaultProps deep-merged OVER the preset config (heading overridden, other
  // preset config keys preserved).
  const config = props.config as Record<string, unknown>;
  assert.equal(config.heading, "Find talent");
  // The embed identity is unchanged.
  assert.equal(out.kind, "section_embed");
  assert.equal(props.sectionTypeKey, "directory");
});

test("governSectionEmbedNode: an UNGOVERNED embed is byte-identical to createBuilderSectionEmbed(key)", () => {
  const node = createBuilderSectionEmbed("directory");
  // No governance anywhere ⇒ same reference back.
  assert.equal(governSectionEmbedNode(node, "directory", []), node);
  // And same reference when the matching item carries no governance.
  assert.equal(governSectionEmbedNode(node, "directory", [embedItem]), node);
});

test("governSectionEmbedNode: dataSourceDefaults bind onto an embed that carries a dataBinding", () => {
  const items: AddGalleryItem[] = [
    { ...embedItem, dataSourceDefaults: { maxItems: 6 } },
  ];
  // Seed a node WITH a dataBinding (a connected embed) so the binding overlay applies.
  const seeded = {
    ...createBuilderSectionEmbed("directory"),
    props: {
      ...(createBuilderSectionEmbed("directory").props as Record<string, unknown>),
      dataBinding: { sourceKey: "talents" },
    },
  } as BuilderNode;
  const out = governSectionEmbedNode(seeded, "directory", items);
  assert.deepEqual((out.props as Record<string, unknown>).dataBinding, {
    sourceKey: "talents",
    maxItems: 6,
  });
});
