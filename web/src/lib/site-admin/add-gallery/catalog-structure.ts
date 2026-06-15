/**
 * Builder Studio — catalog STRUCTURE resolution (Wave 0).
 *
 * The single source of truth for the "+" gallery tab list, replacing the two
 * hard-coded copies (`TAB_DEFS` in add-gallery-panel.tsx and `TAB_LABEL`/
 * `ALL_TABS` in component-catalog.tsx). Code defaults (`CODE_TAB_DEFS`,
 * `ADD_GALLERY_CATEGORIES`) are OVERLAID by admin-editable rows from
 * `builder_catalog_structure` (a `CatalogStructureMap`).
 *
 * PURE (no I/O) so the live gallery, the Lab Catalog, and the Catalog Studio
 * (WS-B) all derive their structure identically. With an EMPTY structure map
 * every resolver returns the code defaults verbatim — so wiring this in is a
 * behavior-preserving refactor until a structure row exists.
 *
 * Wave 0 wires only `resolveTabs` (the de-dup). `resolveCategoriesForTab` +
 * `applyStructureToItems` are provided for WS-B to thread into the gallery
 * read-path. Creating brand-new TABS (which would widen `AddGalleryTab`) is a
 * WS-B follow-up; this module deliberately only renames/reorders/hides the
 * built-in tabs.
 */

import { ADD_GALLERY_CATEGORIES } from "./registry";
import type { AddGalleryCategoryDef, AddGalleryItem, AddGalleryTab } from "./types";

/** The canonical built-in tabs, in order. THE single source (was duplicated). */
export const CODE_TAB_DEFS: ReadonlyArray<{ id: AddGalleryTab; label: string }> = [
  { id: "layout", label: "Layout" },
  { id: "elements", label: "Elements" },
  { id: "sections", label: "Sections" },
  { id: "connected", label: "Connected" },
  { id: "page_templates", label: "Page Templates" },
];

/** One `builder_catalog_structure` row. `ref` = 'tab:<id>' | 'cat:<id>' | 'item:<id>'. */
export interface CatalogStructureRow {
  ref: string;
  kind: "tab" | "category" | "item";
  label_override: string | null;
  icon_override: string | null;
  parent_tab: string | null;
  sort_order: number | null;
  created: boolean;
  hidden: boolean;
  category_override: string | null;
}

/** Structure rows keyed by `ref`. */
export type CatalogStructureMap = Record<string, CatalogStructureRow>;

function tabRow(structure: CatalogStructureMap, id: string) {
  return structure[`tab:${id}`];
}
function catRow(structure: CatalogStructureMap, id: string) {
  return structure[`cat:${id}`];
}

/**
 * The resolved tab list: built-in tabs with admin label/order/hidden overrides
 * applied. Empty structure ⇒ `CODE_TAB_DEFS` verbatim. (New tabs are a WS-B
 * follow-up — they require widening `AddGalleryTab` and are out of scope here.)
 */
export function resolveTabs(
  structure: CatalogStructureMap = {},
): Array<{ id: AddGalleryTab; label: string }> {
  return CODE_TAB_DEFS.map((t, codeIdx) => {
    const ov = tabRow(structure, t.id);
    return {
      id: t.id,
      label: ov?.label_override ?? t.label,
      hidden: ov?.hidden ?? false,
      order: ov?.sort_order ?? null,
      codeIdx,
    };
  })
    .filter((t) => !t.hidden)
    .sort((a, b) => {
      if (a.order != null && b.order != null)
        return a.order - b.order || a.codeIdx - b.codeIdx;
      if (a.order != null) return -1;
      if (b.order != null) return 1;
      return a.codeIdx - b.codeIdx;
    })
    .map(({ id, label }) => ({ id, label }));
}

/** A resolved tab's display label (helper for the Lab's `TAB_LABEL` consumers). */
export function resolveTabLabel(
  tab: AddGalleryTab,
  structure: CatalogStructureMap = {},
): string {
  const ov = tabRow(structure, tab);
  return ov?.label_override ?? CODE_TAB_DEFS.find((t) => t.id === tab)?.label ?? tab;
}

/**
 * The canonical categories for a tab with admin label/icon/order/hidden +
 * `created` overrides applied. Code defaults come from `ADD_GALLERY_CATEGORIES`.
 * Consumed by WS-B in `listGalleryCategoriesForTabFrom`.
 */
export function resolveCategoriesForTab(
  tab: AddGalleryTab,
  structure: CatalogStructureMap = {},
): AddGalleryCategoryDef[] {
  const codeCats = ADD_GALLERY_CATEGORIES.filter((c) => c.tab === tab);
  const created = Object.values(structure).filter(
    (r) =>
      r.kind === "category" &&
      r.created &&
      r.parent_tab === tab &&
      !ADD_GALLERY_CATEGORIES.some((c) => `cat:${c.id}` === r.ref),
  );
  const all: Array<
    AddGalleryCategoryDef & {
      order: number | null;
      codeIdx: number;
      hidden: boolean;
    }
  > = [
    ...codeCats.map((c, codeIdx) => {
      const ov = catRow(structure, c.id);
      return {
        id: c.id,
        label: ov?.label_override ?? c.label,
        icon: ov?.icon_override ?? c.icon,
        tab: (ov?.parent_tab as AddGalleryTab | undefined) ?? c.tab,
        order: ov?.sort_order ?? null,
        codeIdx,
        hidden: ov?.hidden ?? false,
      };
    }),
    ...created.map((r, i) => ({
      id: r.ref.slice("cat:".length),
      label: r.label_override ?? r.ref.slice("cat:".length),
      icon: r.icon_override ?? "sparkle",
      tab,
      order: r.sort_order ?? null,
      codeIdx: codeCats.length + i,
      hidden: false,
    })),
  ];
  return all
    .filter((c) => c.tab === tab && !c.hidden)
    .sort((a, b) => {
      if (a.order != null && b.order != null)
        return a.order - b.order || a.codeIdx - b.codeIdx;
      if (a.order != null) return -1;
      if (b.order != null) return 1;
      return a.codeIdx - b.codeIdx;
    })
    .map(({ id, label, icon, tab: t }) => ({ id, label, icon, tab: t }));
}

/**
 * Rewrite each item's `tab` + `category` per any `item:<id>` structure row
 * (the genuinely new capability: moving a component to a different tab). Pure;
 * empty structure ⇒ items unchanged. Run beside `applyCatalogOverlay` (WS-B).
 */
export function applyStructureToItems(
  items: ReadonlyArray<AddGalleryItem>,
  structure: CatalogStructureMap = {},
): AddGalleryItem[] {
  return items.map((item) => {
    const row = structure[`item:${item.id}`];
    if (!row) return item;
    const nextTab = (row.parent_tab as AddGalleryTab | null) ?? item.tab;
    const nextCategory = row.category_override ?? item.category;
    if (nextTab === item.tab && nextCategory === item.category) return item;
    return { ...item, tab: nextTab, category: nextCategory };
  });
}
