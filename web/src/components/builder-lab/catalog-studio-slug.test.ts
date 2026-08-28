import assert from "node:assert/strict";
import test from "node:test";

import {
  slugifyCategory,
  hiddenTabs,
  hiddenCategoriesByTab,
} from "./catalog-studio-kit";
import type {
  CatalogStructureMap,
  CatalogStructureRow,
} from "@/lib/site-admin/add-gallery/catalog-structure";

function row(
  over: Partial<CatalogStructureRow> & { ref: string },
): CatalogStructureRow {
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

function mapOf(...rows: CatalogStructureRow[]): CatalogStructureMap {
  const m: CatalogStructureMap = {};
  for (const r of rows) m[r.ref] = r;
  return m;
}

test("slugifyCategory: lowercases and kebab-cases", () => {
  assert.equal(slugifyCategory("Hero Sections"), "hero-sections");
  assert.equal(slugifyCategory("  Call To Action  "), "call-to-action");
});

test("slugifyCategory: strips punctuation + collapses separators", () => {
  assert.equal(slugifyCategory("FAQ & Help!"), "faq-help");
  assert.equal(slugifyCategory("a___b---c"), "a-b-c");
  assert.equal(slugifyCategory("Social / Embed"), "social-embed");
});

test("slugifyCategory: strips diacritics to ascii", () => {
  assert.equal(slugifyCategory("Galería"), "galeria");
  assert.equal(slugifyCategory("Cafés & Más"), "cafes-mas");
});

test("slugifyCategory: trims leading/trailing dashes", () => {
  assert.equal(slugifyCategory("--edge--"), "edge");
  assert.equal(slugifyCategory("***"), "");
  assert.equal(slugifyCategory("   "), "");
});

test("slugifyCategory: caps length at 48 chars", () => {
  const long = "x".repeat(80);
  assert.equal(slugifyCategory(long).length, 48);
});

test("hiddenTabs: empty structure ⇒ none", () => {
  assert.deepEqual(hiddenTabs({}), []);
});

test("hiddenTabs: returns hidden tabs with override label", () => {
  const s = mapOf(
    row({ ref: "tab:blocks", kind: "tab", hidden: true }),
    row({
      ref: "tab:designs",
      kind: "tab",
      hidden: true,
      label_override: "Patterns",
    }),
    row({ ref: "tab:data", kind: "tab", hidden: false }),
  );
  const hidden = hiddenTabs(s);
  assert.deepEqual(
    hidden.map((h) => h.id).sort(),
    ["blocks", "designs"],
  );
  assert.equal(hidden.find((h) => h.id === "designs")?.label, "Patterns");
  assert.equal(hidden.find((h) => h.id === "blocks")?.label, "Blocks");
});

test("hiddenCategoriesByTab: groups hidden cats under their tab", () => {
  const s = mapOf(
    // built-in category 'hero' lives in tab 'designs'
    row({ ref: "cat:hero", kind: "category", hidden: true }),
    // a created+hidden category carries its own parent_tab (legacy id maps)
    row({
      ref: "cat:promos",
      kind: "category",
      hidden: true,
      created: true,
      parent_tab: "sections",
      label_override: "Promos",
    }),
    // visible category — excluded
    row({ ref: "cat:about", kind: "category", hidden: false }),
  );
  const byTab = hiddenCategoriesByTab(s);
  assert.deepEqual(
    (byTab.designs ?? []).map((c) => c.id).sort(),
    ["hero", "promos"],
  );
  assert.equal(
    byTab.designs.find((c) => c.id === "hero")?.label,
    "Hero",
  );
  assert.equal(
    byTab.designs.find((c) => c.id === "promos")?.label,
    "Promos",
  );
});

test("hiddenCategoriesByTab: ignores non-category + visible rows", () => {
  const s = mapOf(
    row({ ref: "tab:layout", kind: "tab", hidden: true }),
    row({ ref: "item:foo", kind: "item", hidden: true }),
  );
  assert.deepEqual(hiddenCategoriesByTab(s), {});
});
