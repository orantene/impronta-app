import assert from "node:assert/strict";
import test from "node:test";

import {
  applyKindGovernanceAtInsert,
  governRawInsertNode,
  kindGovernanceIsEmpty,
  resolveKindGovernance,
  type KindGovernance,
} from "./kind-governance";
import { createBuilderNode } from "@/lib/site-admin/builder-node/create";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { AddGalleryItem } from "./types";

// ── fixtures ──────────────────────────────────────────────────────────────────

const baseItem: AddGalleryItem = {
  id: "el-text",
  label: "Text",
  description: "A paragraph",
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
