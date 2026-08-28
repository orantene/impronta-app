import assert from "node:assert/strict";
import test from "node:test";

import {
  CODE_TAB_DEFS,
  applyStructureToItems,
  canonicalGalleryTab,
  normalizeAllowedTabs,
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
    tab: "blocks",
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

test("resolveTabs: empty structure ⇒ four tabs Blocks / Designs / Data / Shell", () => {
  assert.deepEqual(resolveTabs({}), [
    { id: "blocks", label: "Blocks" },
    { id: "designs", label: "Designs" },
    { id: "data", label: "Data" },
    { id: "shell", label: "Shell" },
  ]);
  assert.deepEqual(
    resolveTabs({}),
    CODE_TAB_DEFS.map((t) => ({ id: t.id, label: t.label })),
  );
});

test("resolveTabs: label override renames a built-in tab", () => {
  const s: CatalogStructureMap = {
    "tab:designs": row({ ref: "tab:designs", label_override: "Patterns" }),
  };
  assert.equal(resolveTabs(s).find((t) => t.id === "designs")?.label, "Patterns");
});

test("resolveTabs: a legacy tab:sections rename applies to Designs", () => {
  const s: CatalogStructureMap = {
    "tab:sections": row({ ref: "tab:sections", label_override: "Patterns" }),
  };
  assert.equal(resolveTabs(s).find((t) => t.id === "designs")?.label, "Patterns");
});

test("resolveTabs: hidden removes a tab", () => {
  const s: CatalogStructureMap = { "tab:data": row({ ref: "tab:data", hidden: true }) };
  assert.equal(resolveTabs(s).some((t) => t.id === "data"), false);
});

test("resolveTabs: hiding the legacy connected tab hides Data", () => {
  const s: CatalogStructureMap = {
    "tab:connected": row({ ref: "tab:connected", hidden: true }),
  };
  assert.equal(resolveTabs(s).some((t) => t.id === "data"), false);
});

test("resolveTabs: hiding page_templates does NOT hide Designs", () => {
  const s: CatalogStructureMap = {
    "tab:page_templates": row({ ref: "tab:page_templates", hidden: true }),
  };
  assert.equal(resolveTabs(s).some((t) => t.id === "designs"), true);
});

test("resolveTabs: sort_order reorders ahead of code order", () => {
  const s: CatalogStructureMap = { "tab:shell": row({ ref: "tab:shell", sort_order: 0 }) };
  assert.equal(resolveTabs(s)[0].id, "shell");
});

test("resolveTabLabel: falls back to the code label without an override", () => {
  assert.equal(resolveTabLabel("blocks", {}), "Blocks");
  assert.equal(
    resolveTabLabel("blocks", { "tab:blocks": row({ ref: "tab:blocks", label_override: "Bits" }) }),
    "Bits",
  );
});

test("canonicalGalleryTab maps the six legacy ids onto the four UI tabs", () => {
  assert.equal(canonicalGalleryTab("layout"), "blocks");
  assert.equal(canonicalGalleryTab("elements"), "blocks");
  assert.equal(canonicalGalleryTab("sections"), "designs");
  assert.equal(canonicalGalleryTab("page_templates"), "designs");
  assert.equal(canonicalGalleryTab("connected"), "data");
  assert.equal(canonicalGalleryTab("shell"), "shell");
  assert.equal(canonicalGalleryTab("nope"), null);
});

test("normalizeAllowedTabs maps old ids and de-dupes in CODE order", () => {
  assert.deepEqual(
    normalizeAllowedTabs(["layout", "elements", "sections", "connected"]),
    ["blocks", "designs", "data"],
  );
  assert.deepEqual(
    normalizeAllowedTabs(["layout", "elements", "sections", "connected", "page_templates"]),
    ["blocks", "designs", "data"],
  );
  assert.deepEqual(
    normalizeAllowedTabs(["layout", "elements", "sections", "connected", "shell"]),
    ["blocks", "designs", "data", "shell"],
  );
  assert.deepEqual(normalizeAllowedTabs(["elements"]), ["blocks"]);
  assert.deepEqual(
    normalizeAllowedTabs(["blocks", "designs", "data", "shell"]),
    ["blocks", "designs", "data", "shell"],
  );
});

// ── resolveCategoriesForTab ──────────────────────────────────────────────────

test("resolveCategoriesForTab: created category is appended to its parent tab", () => {
  const s: CatalogStructureMap = {
    "cat:promos": row({
      ref: "cat:promos",
      kind: "category",
      created: true,
      parent_tab: "blocks",
      label_override: "Promos",
    }),
  };
  const cats = resolveCategoriesForTab("blocks", s);
  assert.ok(cats.some((c) => c.id === "promos" && c.label === "Promos"));
});

test("resolveCategoriesForTab: a legacy parent_tab still lands on the merged tab", () => {
  const s: CatalogStructureMap = {
    "cat:promos": row({
      ref: "cat:promos",
      kind: "category",
      created: true,
      parent_tab: "elements",
      label_override: "Promos",
    }),
  };
  const cats = resolveCategoriesForTab("blocks", s);
  assert.ok(cats.some((c) => c.id === "promos" && c.tab === "blocks"));
});

// ── applyStructureToItems ────────────────────────────────────────────────────

test("applyStructureToItems: empty structure ⇒ items unchanged (element identity preserved)", () => {
  const items = [item({ id: "el-button" })];
  const out = applyStructureToItems(items, {});
  assert.deepEqual(out, items);
  assert.equal(out[0], items[0]); // unmodified items keep their reference (no needless realloc)
});

test("applyStructureToItems: an item: row moves a component to a new tab + category", () => {
  const items = [item({ id: "el-button", tab: "blocks", category: "buttons" })];
  const s: CatalogStructureMap = {
    "item:el-button": row({
      ref: "item:el-button",
      kind: "item",
      parent_tab: "designs",
      category_override: "promos",
    }),
  };
  const [moved] = applyStructureToItems(items, s);
  assert.equal(moved.tab, "designs");
  assert.equal(moved.category, "promos");
});

test("applyStructureToItems: a legacy parent_tab is canonicalized", () => {
  const items = [item({ id: "el-button", tab: "blocks", category: "buttons" })];
  const s: CatalogStructureMap = {
    "item:el-button": row({
      ref: "item:el-button",
      kind: "item",
      parent_tab: "layout",
      category_override: "promos",
    }),
  };
  const [moved] = applyStructureToItems(items, s);
  assert.equal(moved.tab, "blocks");
  assert.equal(moved.category, "promos");
});

test("applyStructureToItems: a row for a different item leaves others untouched", () => {
  const items = [item({ id: "el-button" }), item({ id: "el-heading", category: "text" })];
  const s: CatalogStructureMap = {
    "item:el-button": row({ ref: "item:el-button", kind: "item", parent_tab: "designs" }),
  };
  const out = applyStructureToItems(items, s);
  assert.equal(out[0].tab, "designs");
  assert.equal(out[1], items[1]); // unchanged reference
});

// ── structure HIDE subtracts the components, not just the grouping ───────────
// (regression: a hidden category only got demoted to the end of the gallery's
// category list because the panel's present-category fallback re-added it as an
// "extra" — its items stayed addable. Hiding must remove the items too.)

test("applyStructureToItems: a hidden category drops its components from the gallery", () => {
  const items = [
    item({ id: "el-text", category: "text" }),
    item({ id: "el-button", category: "buttons" }),
  ];
  const s: CatalogStructureMap = {
    "cat:text": row({ ref: "cat:text", kind: "category", parent_tab: "blocks", hidden: true }),
  };
  const out = applyStructureToItems(items, s);
  assert.deepEqual(out.map((i) => i.id), ["el-button"]); // el-text subtracted, control kept
});

test("applyStructureToItems: a hidden tab drops every component in it", () => {
  const items = [
    item({ id: "conn-repeater", tab: "data", category: "dynamic" }),
    item({ id: "el-button", tab: "blocks", category: "buttons" }),
  ];
  const s: CatalogStructureMap = {
    "tab:data": row({ ref: "tab:data", hidden: true }),
  };
  const out = applyStructureToItems(items, s);
  assert.deepEqual(out.map((i) => i.id), ["el-button"]);
});

test("applyStructureToItems: an item moved OUT of a hidden category via item:<id> survives", () => {
  // The whole "text" category is hidden, but this one component is explicitly
  // re-homed into a visible category — its NEW location wins, so it stays.
  const items = [item({ id: "el-text", category: "text" })];
  const s: CatalogStructureMap = {
    "cat:text": row({ ref: "cat:text", kind: "category", parent_tab: "blocks", hidden: true }),
    "item:el-text": row({ ref: "item:el-text", kind: "item", category_override: "buttons" }),
  };
  const out = applyStructureToItems(items, s);
  assert.deepEqual(out.map((i) => i.id), ["el-text"]);
  assert.equal(out[0].category, "buttons");
});

test("applyStructureToItems: an item moved INTO a hidden category via item:<id> is dropped", () => {
  const items = [item({ id: "el-button", category: "buttons" })];
  const s: CatalogStructureMap = {
    "cat:archive": row({ ref: "cat:archive", kind: "category", parent_tab: "blocks", hidden: true }),
    "item:el-button": row({ ref: "item:el-button", kind: "item", category_override: "archive" }),
  };
  assert.equal(applyStructureToItems(items, s).length, 0);
});
