import assert from "node:assert/strict";
import test from "node:test";

import {
  CODE_TAB_DEFS,
  applyStructureToItems,
  resolveCategoriesForTab,
  resolveTabLabel,
  resolveTabs,
  type CatalogStructureMap,
  type CatalogStructureRow,
} from "./catalog-structure";
import type { AddGalleryItem } from "./types";

function row(over: Partial<CatalogStructureRow> & { ref: string }): CatalogStructureRow {
  return {
    kind: "tab",
    label_override: null,
    icon_override: null,
    parent_tab: null,
    sort_order: null,
    created: false,
    hidden: false,
    category_override: null,
    ...over,
  };
}

function item(over: Partial<AddGalleryItem> & { id: string }): AddGalleryItem {
  return {
    label: "Button",
    description: "",
    tab: "elements",
    category: "buttons",
    icon: "buttons",
    previewType: "icon-card",
    itemKind: "static",
    insertMethod: "nativeNode",
    dragSupported: true,
    availability: "available",
    sourceType: "native-freeform",
    ...over,
  };
}

// ── resolveTabs ──────────────────────────────────────────────────────────────

test("resolveTabs: empty structure ⇒ CODE_TAB_DEFS verbatim", () => {
  assert.deepEqual(resolveTabs({}), CODE_TAB_DEFS.map((t) => ({ id: t.id, label: t.label })));
});

test("resolveTabs: label override renames a built-in tab", () => {
  const s: CatalogStructureMap = { "tab:sections": row({ ref: "tab:sections", label_override: "Blocks" }) };
  assert.equal(resolveTabs(s).find((t) => t.id === "sections")?.label, "Blocks");
});

test("resolveTabs: hidden removes a tab", () => {
  const s: CatalogStructureMap = { "tab:connected": row({ ref: "tab:connected", hidden: true }) };
  assert.equal(resolveTabs(s).some((t) => t.id === "connected"), false);
});

test("resolveTabs: sort_order reorders ahead of code order", () => {
  const s: CatalogStructureMap = { "tab:page_templates": row({ ref: "tab:page_templates", sort_order: 0 }) };
  assert.equal(resolveTabs(s)[0].id, "page_templates");
});

test("resolveTabLabel: falls back to the code label without an override", () => {
  assert.equal(resolveTabLabel("elements", {}), "Elements");
  assert.equal(
    resolveTabLabel("elements", { "tab:elements": row({ ref: "tab:elements", label_override: "Bits" }) }),
    "Bits",
  );
});

// ── resolveCategoriesForTab ──────────────────────────────────────────────────

test("resolveCategoriesForTab: created category is appended to its parent tab", () => {
  const s: CatalogStructureMap = {
    "cat:promos": row({
      ref: "cat:promos",
      kind: "category",
      created: true,
      parent_tab: "elements",
      label_override: "Promos",
    }),
  };
  const cats = resolveCategoriesForTab("elements", s);
  assert.ok(cats.some((c) => c.id === "promos" && c.label === "Promos"));
});

// ── applyStructureToItems ────────────────────────────────────────────────────

test("applyStructureToItems: empty structure ⇒ items unchanged (element identity preserved)", () => {
  const items = [item({ id: "el-button" })];
  const out = applyStructureToItems(items, {});
  assert.deepEqual(out, items);
  assert.equal(out[0], items[0]); // unmodified items keep their reference (no needless realloc)
});

test("applyStructureToItems: an item: row moves a component to a new tab + category", () => {
  const items = [item({ id: "el-button", tab: "elements", category: "buttons" })];
  const s: CatalogStructureMap = {
    "item:el-button": row({
      ref: "item:el-button",
      kind: "item",
      parent_tab: "layout",
      category_override: "promos",
    }),
  };
  const [moved] = applyStructureToItems(items, s);
  assert.equal(moved.tab, "layout");
  assert.equal(moved.category, "promos");
});

test("applyStructureToItems: a row for a different item leaves others untouched", () => {
  const items = [item({ id: "el-button" }), item({ id: "el-heading", category: "text" })];
  const s: CatalogStructureMap = {
    "item:el-button": row({ ref: "item:el-button", kind: "item", parent_tab: "layout" }),
  };
  const out = applyStructureToItems(items, s);
  assert.equal(out[0].tab, "layout");
  assert.equal(out[1], items[1]); // unchanged reference
});
