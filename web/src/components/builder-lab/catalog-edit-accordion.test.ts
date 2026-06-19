import assert from "node:assert/strict";
import { test } from "node:test";

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import {
  allExpanded,
  collapseAll,
  editFormFromItem,
  emptyEditForm,
  expandAll,
  expandedCount,
  toggleExpanded,
} from "./catalog-edit-accordion";

// ── toggleExpanded ────────────────────────────────────────────────────────────

test("toggleExpanded: adds an absent id, returns a new set (no mutation)", () => {
  const base = new Set(["a"]);
  const next = toggleExpanded(base, "b");
  assert.deepEqual([...next].sort(), ["a", "b"]);
  // original untouched
  assert.deepEqual([...base], ["a"]);
  assert.notEqual(next, base);
});

test("toggleExpanded: removes a present id", () => {
  const next = toggleExpanded(new Set(["a", "b"]), "a");
  assert.deepEqual([...next], ["b"]);
});

// ── expandAll / collapseAll over a working list ───────────────────────────────

test("expandAll: unions the listed ids onto the set", () => {
  const next = expandAll(new Set(["x"]), ["a", "b"]);
  assert.deepEqual([...next].sort(), ["a", "b", "x"]);
});

test("expandAll: empty id list leaves the set unchanged", () => {
  const next = expandAll(new Set(["x"]), []);
  assert.deepEqual([...next], ["x"]);
});

test("collapseAll: removes ONLY the listed ids — others stay open", () => {
  // "z" is open in another (off-screen) tab and must survive a collapse-all of
  // the currently-listed rows.
  const next = collapseAll(new Set(["a", "b", "z"]), ["a", "b"]);
  assert.deepEqual([...next], ["z"]);
});

test("expandAll then collapseAll round-trips to the original set", () => {
  const ids = ["a", "b", "c"];
  const start = new Set<string>(["z"]);
  const opened = expandAll(start, ids);
  const closed = collapseAll(opened, ids);
  assert.deepEqual([...closed], ["z"]);
});

// ── allExpanded / expandedCount ───────────────────────────────────────────────

test("allExpanded: true only when every listed id is open", () => {
  assert.equal(allExpanded(new Set(["a", "b"]), ["a", "b"]), true);
  assert.equal(allExpanded(new Set(["a"]), ["a", "b"]), false);
});

test("allExpanded: empty list is false (nothing to collapse)", () => {
  assert.equal(allExpanded(new Set(["a"]), []), false);
});

test("expandedCount: counts only listed ids that are open", () => {
  assert.equal(expandedCount(new Set(["a", "b", "z"]), ["a", "b", "c"]), 2);
  assert.equal(expandedCount(new Set(), ["a"]), 0);
});

// ── form snapshots ────────────────────────────────────────────────────────────

test("emptyEditForm: all blank, no errors", () => {
  const f = emptyEditForm();
  assert.equal(f.label, "");
  assert.equal(f.lockedProps, "");
  assert.equal(f.defaultProps, "");
  assert.equal(f.defaultPropsError, null);
  assert.equal(f.dataSourceDefaultsError, null);
});

test("editFormFromItem: seeds from the row overlay (independent per id)", () => {
  const item = {
    id: "el-button",
    overlay: {
      label_override: "Primary CTA",
      category_override: "Actions",
      icon_override: "bolt",
      required_plan_override: "studio",
      locked_props: ["tone", "style.textColor"],
      default_variant: "icon-button",
      default_props: { tone: "primary" },
      data_source_defaults: { maxItems: 6 },
    },
  } as unknown as CatalogAdminItem;

  const f = editFormFromItem(item);
  assert.equal(f.label, "Primary CTA");
  assert.equal(f.category, "Actions");
  assert.equal(f.icon, "bolt");
  assert.equal(f.plan, "studio");
  assert.equal(f.lockedProps, "tone, style.textColor");
  assert.equal(f.defaultVariant, "icon-button");
  assert.equal(JSON.parse(f.defaultProps).tone, "primary");
  assert.equal(JSON.parse(f.dataSourceDefaults).maxItems, 6);
  assert.equal(f.defaultPropsError, null);
});

test("editFormFromItem: a row with no overlay seeds all blank", () => {
  const item = { id: "el-text", overlay: null } as unknown as CatalogAdminItem;
  const f = editFormFromItem(item);
  assert.equal(f.label, "");
  assert.equal(f.lockedProps, "");
  assert.equal(f.defaultProps, "");
});

// ── multi-open acceptance: several rows open at once with independent forms ────

test("acceptance: three rows stay expanded side-by-side", () => {
  let set = new Set<string>();
  set = toggleExpanded(set, "row-1");
  set = toggleExpanded(set, "row-2");
  set = toggleExpanded(set, "row-3");
  assert.equal(set.size, 3);
  assert.ok(set.has("row-1") && set.has("row-2") && set.has("row-3"));
  // closing one leaves the other two open
  set = toggleExpanded(set, "row-2");
  assert.deepEqual([...set].sort(), ["row-1", "row-3"]);
});
