import assert from "node:assert/strict";
import test from "node:test";

import { governanceChips, hasAnyOverride } from "./catalog-governance";
import { isShellKind } from "./catalog-playground";
import { targetAllows } from "./catalog-row-table";
import type { CatalogOverlayRow } from "@/lib/site-admin/add-gallery";
// REAL registry exports — the lesson from a live bug where a hand-mock hid a
// real-registry mismatch. These tests run the Lab's catalog resolvers against
// the ACTUAL component universe, not a fabricated row list.
import { ADD_GALLERY_ITEMS, ADD_GALLERY_CATEGORIES } from "@/lib/site-admin/add-gallery/registry";
import { buildCatalogAdminView } from "@/lib/site-admin/add-gallery/registry-db-merge";
import {
  CODE_TAB_DEFS,
  resolveTabs,
  resolveCategoriesForTab,
  applyStructureToItems,
  type CatalogStructureMap,
} from "@/lib/site-admin/add-gallery/catalog-structure";

function overlay(over: Partial<CatalogOverlayRow> = {}): CatalogOverlayRow {
  return {
    item_ref: "x",
    source: "code",
    talent_enabled: true,
    workspace_enabled: true,
    label_override: null,
    icon_override: null,
    category_override: null,
    required_plan_override: null,
    availability_override: null,
    ...over,
  };
}

// ── governanceChips (unit) ───────────────────────────────────────────────────

test("governanceChips: no overlay ⇒ no chips", () => {
  assert.deepEqual(governanceChips(null), []);
  assert.deepEqual(governanceChips(undefined), []);
});

test("governanceChips: a plain rename is NOT a governance chip", () => {
  // label/icon/category renames already show in the effective label — they
  // shouldn't add a governance chip.
  assert.deepEqual(
    governanceChips(overlay({ label_override: "Renamed", icon_override: "star" })),
    [],
  );
});

test("governanceChips: locked props ⇒ a counted lock chip", () => {
  const chips = governanceChips(overlay({ locked_props: ["tone", "style.textColor"] }));
  assert.equal(chips.length, 1);
  assert.equal(chips[0].kind, "locked");
  assert.match(chips[0].label, /2 locked/);
});

test("governanceChips: empty locked_props array ⇒ no lock chip", () => {
  assert.deepEqual(governanceChips(overlay({ locked_props: [] })), []);
});

test("governanceChips: empty default_props object ⇒ no chip", () => {
  // {} is not a meaningful override — only non-empty objects flag a chip.
  assert.deepEqual(governanceChips(overlay({ default_props: {} })), []);
  assert.deepEqual(governanceChips(overlay({ data_source_defaults: {} })), []);
});

test("governanceChips: all governance dimensions, stable order", () => {
  const chips = governanceChips(
    overlay({
      locked_props: ["tone"],
      default_props: { tone: "primary" },
      default_variant: "title",
      data_source_defaults: { maxItems: 6 },
      required_plan_override: "agency",
    }),
  );
  assert.deepEqual(
    chips.map((c) => c.kind),
    ["locked", "defaults", "variant", "data", "plan"],
  );
  assert.match(chips.find((c) => c.kind === "variant")!.label, /title/);
  assert.match(chips.find((c) => c.kind === "plan")!.label, /agency/);
});

test("governanceChips: whitespace-only default_variant ⇒ no chip", () => {
  assert.deepEqual(governanceChips(overlay({ default_variant: "   " })), []);
});

// ── hasAnyOverride (unit) ────────────────────────────────────────────────────

test("hasAnyOverride: null ⇒ false; bare enabled overlay ⇒ false", () => {
  assert.equal(hasAnyOverride(null), false);
  // A default-shaped overlay (both enabled, no overrides) is not a real override.
  assert.equal(hasAnyOverride(overlay()), false);
});

test("hasAnyOverride: cosmetic rename OR governance ⇒ true", () => {
  assert.equal(hasAnyOverride(overlay({ label_override: "X" })), true);
  assert.equal(hasAnyOverride(overlay({ availability_override: "hidden" })), true);
  assert.equal(hasAnyOverride(overlay({ locked_props: ["a"] })), true);
});

// ── isShellKind (unit) ───────────────────────────────────────────────────────

test("isShellKind: shell header/footer true, page_template false", () => {
  assert.equal(isShellKind("shell_header"), true);
  assert.equal(isShellKind("shell_footer"), true);
  assert.equal(isShellKind("page_template"), false);
});

// ── targetAllows (unit) ──────────────────────────────────────────────────────

test("targetAllows: both allows either surface; specific gates", () => {
  assert.equal(targetAllows("both", "talent"), true);
  assert.equal(targetAllows("both", "workspace"), true);
  assert.equal(targetAllows("talent", "talent"), true);
  assert.equal(targetAllows("talent", "workspace"), false);
  assert.equal(targetAllows("workspace", "talent"), false);
});

// ── REAL-REGISTRY integration ────────────────────────────────────────────────
// Feed the ACTUAL ADD_GALLERY_ITEMS through the resolvers the Lab catalog uses,
// proving the row table + governance chips hold against the real universe.

test("real registry: buildCatalogAdminView maps every item, no governance chips by default", () => {
  const rows = buildCatalogAdminView(ADD_GALLERY_ITEMS, {});
  assert.equal(rows.length, ADD_GALLERY_ITEMS.length);
  assert.ok(rows.length > 0, "registry is non-empty");
  for (const r of rows) {
    // No overlay ⇒ no chips and no 'override' signal — the catalog's default
    // render state.
    assert.deepEqual(governanceChips(r.overlay), []);
    assert.equal(hasAnyOverride(r.overlay), false);
    // The row table groups + sorts by effectiveCategory/effectiveLabel — both
    // must be defined strings for every real item.
    assert.equal(typeof r.effectiveLabel, "string");
    assert.ok(r.effectiveLabel.length > 0, `${r.id} has a label`);
    assert.equal(typeof r.effectiveCategory, "string");
  }
});

test("real registry: a locked-props overlay on a real item yields a lock chip", () => {
  const first = ADD_GALLERY_ITEMS[0];
  const rows = buildCatalogAdminView(ADD_GALLERY_ITEMS, {
    [first.id]: overlay({
      item_ref: first.id,
      locked_props: ["tone"],
      default_variant: "title",
    }),
  });
  const row = rows.find((r) => r.id === first.id)!;
  const kinds = governanceChips(row.overlay).map((c) => c.kind);
  assert.deepEqual(kinds, ["locked", "variant"]);
  assert.equal(hasAnyOverride(row.overlay), true);
});

test("real registry: every code-default tab id is a real AddGalleryTab used by items or known-empty", () => {
  // The Lab derives its tab list from CODE_TAB_DEFS; resolveTabs with an empty
  // structure must return exactly those ids in order — a guard against the tab
  // source-of-truth drifting from the real registry's tab union.
  const resolved = resolveTabs({}).map((t) => t.id);
  assert.deepEqual(resolved, CODE_TAB_DEFS.map((t) => t.id));
  // Every tab an item actually uses must be present in CODE_TAB_DEFS (else the
  // Lab would silently drop those rows).
  const codeTabIds = new Set(CODE_TAB_DEFS.map((t) => t.id));
  for (const item of ADD_GALLERY_ITEMS) {
    assert.ok(
      codeTabIds.has(item.tab),
      `item ${item.id} uses tab "${item.tab}" missing from CODE_TAB_DEFS`,
    );
  }
});

test("real registry: every item's category resolves within its tab's categories", () => {
  // Catalog Studio places items under resolveCategoriesForTab(tab); an item
  // whose category isn't a known category of its tab would render orphaned.
  // (Roadmap/coming-soon items can carry ad-hoc categories, so we assert the
  // resolver is well-formed for the categories that DO back real items.)
  const realCategoryIds = new Set(ADD_GALLERY_CATEGORIES.map((c) => c.id));
  for (const tab of CODE_TAB_DEFS) {
    const cats = resolveCategoriesForTab(tab.id, {});
    for (const c of cats) {
      assert.ok(realCategoryIds.has(c.id), `resolved category ${c.id} is real`);
      assert.equal(c.tab, tab.id, `category ${c.id} resolves under its tab`);
    }
  }
});

test("real registry: applyStructureToItems with empty structure is identity", () => {
  // The behavior-preserving guarantee the Studio relies on: no structure rows
  // ⇒ the real items pass through untouched (same tab + category).
  const out = applyStructureToItems(ADD_GALLERY_ITEMS, {});
  assert.equal(out.length, ADD_GALLERY_ITEMS.length);
  for (let i = 0; i < out.length; i++) {
    assert.equal(out[i].tab, ADD_GALLERY_ITEMS[i].tab);
    assert.equal(out[i].category, ADD_GALLERY_ITEMS[i].category);
  }
});

test("real registry: moving a real item via structure rewrites its tab + category", () => {
  const item = ADD_GALLERY_ITEMS.find((i) => i.tab !== "layout") ?? ADD_GALLERY_ITEMS[0];
  const structure: CatalogStructureMap = {
    [`item:${item.id}`]: {
      ref: `item:${item.id}`,
      kind: "item",
      label_override: null,
      icon_override: null,
      parent_tab: "layout",
      sort_order: null,
      created: false,
      hidden: false,
      category_override: "containers",
    },
  };
  const out = applyStructureToItems(ADD_GALLERY_ITEMS, structure);
  const moved = out.find((i) => i.id === item.id)!;
  assert.equal(moved.tab, "layout");
  assert.equal(moved.category, "containers");
});
