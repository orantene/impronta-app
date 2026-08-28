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
 * read-path. The four UI tabs (Blocks / Designs / Data / Shell) are the
 * built-in set; admin structure rows may still name the legacy six-tab ids
 * and are canonicalized on read.
 */

import { ADD_GALLERY_CATEGORIES } from "./registry";
import type { AddGalleryCategoryDef, AddGalleryItem, AddGalleryTab } from "./types";
import {
  CODE_TAB_LABELS,
  GALLERY_TAB_IDS,
  LEGACY_TAB_STRUCTURE_FALLBACKS,
  canonicalGalleryTab,
} from "./gallery-tab-ids";

export {
  allowListHasPageTemplates,
  canonicalGalleryTab,
  isCanonicalGalleryTab,
  normalizeAllowedTabs,
} from "./gallery-tab-ids";

/** The canonical built-in tabs, in order. THE single source (was duplicated). */
export const CODE_TAB_DEFS: ReadonlyArray<{ id: AddGalleryTab; label: string }> =
  GALLERY_TAB_IDS.map((id) => ({ id, label: CODE_TAB_LABELS[id] }));

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
  const canon = canonicalGalleryTab(id) ?? id;
  const direct = structure[`tab:${canon}`];
  if (direct) return direct;
  if (canon === id) {
    const fallbacks = LEGACY_TAB_STRUCTURE_FALLBACKS[canon as AddGalleryTab];
    if (fallbacks) {
      for (const legacy of fallbacks) {
        const row = structure[`tab:${legacy}`];
        if (row) return row;
      }
    }
  }
  return structure[`tab:${id}`];
}
function catRow(structure: CatalogStructureMap, id: string) {
  return structure[`cat:${id}`];
}

/**
 * The resolved tab list: built-in tabs with admin label/order/hidden overrides
 * applied. Empty structure ⇒ `CODE_TAB_DEFS` verbatim. Legacy structure rows
 * (`tab:elements`, `tab:sections`, …) still apply to the merged four tabs.
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
      canonicalGalleryTab(r.parent_tab) === tab &&
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
        tab: canonicalGalleryTab(ov?.parent_tab) ?? c.tab,
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
 * (moving a component to a different tab/category) AND subtract any item that
 * lands in a hidden tab or hidden category. Pure; empty structure ⇒ items
 * unchanged. Run beside `applyCatalogOverlay` (WS-B).
 */
export function applyStructureToItems(
  items: ReadonlyArray<AddGalleryItem>,
  structure: CatalogStructureMap = {},
): AddGalleryItem[] {
  const out: AddGalleryItem[] = [];
  for (const item of items) {
    const row = structure[`item:${item.id}`];
    const nextTab = row?.parent_tab
      ? (canonicalGalleryTab(row.parent_tab) ?? item.tab)
      : item.tab;
    const nextCategory = row?.category_override ?? item.category;
    // STRUCTURE HIDE — hiding a tab or a category in Catalog Studio means
    // "tenants shouldn't see this", so the components INSIDE it must drop from
    // the live gallery, not merely lose their grouping. Without this subtraction
    // the panel's present-category fallback re-adds a hidden category as an
    // "extra" and its items stay addable (the bug: a hidden category only got
    // demoted to the end of the list). `resolveTabs`/`resolveCategoriesForTab`
    // already drop the hidden tab/category from the taxonomy; this aligns the
    // ITEM set with them. Item-level moves win: a component routed into a
    // non-hidden category via `item:<id>` is judged by its NEW location, so an
    // admin can rescue a single component out of an otherwise-hidden category.
    if (tabRow(structure, nextTab)?.hidden) continue;
    if (catRow(structure, nextCategory)?.hidden) continue;
    if (nextTab === item.tab && nextCategory === item.category) {
      out.push(item);
      continue;
    }
    out.push({ ...item, tab: nextTab, category: nextCategory });
  }
  return out;
}
