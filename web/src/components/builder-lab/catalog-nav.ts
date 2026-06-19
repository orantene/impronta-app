/**
 * catalog-nav — pure view-taxonomy for the Builder Lab Catalog.
 *
 * P1 introduces a TWO-TIER navigation over the (previously flat 15-tab) Catalog
 * view strip. Tier-1 is the GROUP (Structure / Design / Admin); tier-2 is the
 * group's ordered sub-views. This module owns ALL the pure plumbing for that:
 *
 *   • the view universe — `CatalogView` = every gallery tab ∪ every special tab
 *     (lifted verbatim out of component-catalog.tsx so it stays the one source);
 *   • the group membership + ordering;
 *   • `groupOfView` (reverse lookup, unknown → "structure"),
 *     `orderedViewsForGroup`, `isValidView`, `firstViewOfGroup`.
 *
 * No React, no DOM, no localStorage — every export here is pure and unit-tested
 * (`catalog-nav.test.ts`). The component re-imports the lifted types/consts.
 */

import { type AddGalleryTab } from "@/lib/site-admin/add-gallery";
import { CODE_TAB_DEFS } from "@/lib/site-admin/add-gallery/catalog-structure";

// ── View universe (lifted from component-catalog.tsx) ───────────────────────
// Tab → default label, derived from the Builder Studio catalog-structure
// resolver (admin renames are layered on at render time by `resolveTabLabel`).
const TAB_LABEL = Object.fromEntries(
  CODE_TAB_DEFS.map((t) => [t.id, t.label]),
) as Record<AddGalleryTab, string>;

// Special (non-gallery) Catalog views. "all" (the unified superset index) is
// special too but rendered FIRST within the Structure group. The set membership
// here only marks them non-gallery — ORDER is decided per-group below.
// P1 adds "health" (the promoted D8 Catalog-health view, in the Admin group).
export const SPECIAL_TABS = [
  "all",
  "catalog_studio",
  "site_starter_kit",
  "site_defaults",
  "default_surfaces",
  "playground",
  "activity",
  "templates",
  "parity",
  "taxonomy",
  "health",
] as const;
export type SpecialTab = (typeof SPECIAL_TABS)[number];
export type CatalogView = AddGalleryTab | SpecialTab;

// SPECIAL_TABS that render AFTER the gallery categories within the Structure
// group (i.e. everything except the leading "all" superset index). Retained for
// compatibility with the old flat strip; the grouped nav uses GROUP_VIEWS.
export const TRAILING_SPECIAL_TABS = SPECIAL_TABS.filter((t) => t !== "all");

export const VIEW_LABEL: Record<CatalogView, string> = {
  ...TAB_LABEL,
  all: "All",
  catalog_studio: "Catalog Studio",
  site_starter_kit: "Site Starter Kit",
  site_defaults: "Site Defaults",
  default_surfaces: "Default surfaces",
  playground: "Playground",
  activity: "Activity",
  templates: "Templates",
  parity: "Parity",
  taxonomy: "Taxonomy",
  health: "Health",
};

export function isSpecialTab(v: CatalogView): v is SpecialTab {
  return (SPECIAL_TABS as readonly string[]).includes(v);
}

// ── Two-tier groups ─────────────────────────────────────────────────────────
export type CatalogGroup = "structure" | "design" | "admin";

export const GROUP_ORDER: ReadonlyArray<CatalogGroup> = [
  "structure",
  "design",
  "admin",
];

export const GROUP_LABEL: Record<CatalogGroup, string> = {
  structure: "Structure",
  design: "Design",
  admin: "Admin",
};

/** Static group → ordered member views. For `structure` the gallery-tab portion
 *  (layout/elements/sections/connected/shell) is the DESIGN-time order; at
 *  render time `orderedViewsForGroup` filters those by presence + reorders to
 *  the live CODE_TAB_DEFS order, with `all` pinned first and `catalog_studio`
 *  last. design/admin are static. */
export const GROUP_VIEWS: Record<CatalogGroup, ReadonlyArray<CatalogView>> = {
  structure: [
    "all",
    "layout",
    "elements",
    "sections",
    "connected",
    "shell",
    "catalog_studio",
  ],
  design: [
    "site_starter_kit",
    "playground",
    "templates",
    "site_defaults",
    "default_surfaces",
  ],
  admin: ["taxonomy", "parity", "activity", "health"],
};

// Reverse index: view → owning group. Built once from GROUP_VIEWS.
const VIEW_GROUP = new Map<CatalogView, CatalogGroup>();
for (const group of GROUP_ORDER) {
  for (const view of GROUP_VIEWS[group]) VIEW_GROUP.set(view, group);
}

/** Which group owns a view. Unknown / unmapped views fall back to "structure"
 *  (the safe default surface — never strands the user on an empty tier-2). */
export function groupOfView(view: CatalogView): CatalogGroup {
  return VIEW_GROUP.get(view) ?? "structure";
}

/** Is `v` a real, navigable Catalog view? Excludes the empty `page_templates`
 *  gallery tab (its full-page role moved to Site Starter Kit) and anything not
 *  in the view universe. Accepts "health". */
export function isValidView(v: string): v is CatalogView {
  if (v === "page_templates") return false;
  if ((SPECIAL_TABS as readonly string[]).includes(v)) return true;
  return CODE_TAB_DEFS.some((t) => t.id === v && t.id !== "page_templates");
}

/** The Structure group's gallery-tab members in CODE_TAB_DEFS order (the live
 *  tab order admins can rename but not reorder here), excluding the empty
 *  page_templates tab. */
const STRUCTURE_GALLERY_TABS: ReadonlyArray<AddGalleryTab> = CODE_TAB_DEFS.map(
  (t) => t.id,
).filter(
  (id) => id !== "page_templates" && GROUP_VIEWS.structure.includes(id),
);

/** Ordered tier-2 views for a group.
 *  - structure: `all` first, then the dynamic gallery tabs (layout/elements/
 *    sections/connected/shell) filtered to those PRESENT in `presentGalleryTabs`
 *    and ordered by CODE_TAB_DEFS, then `catalog_studio` last.
 *  - design / admin: the static GROUP_VIEWS list verbatim. */
export function orderedViewsForGroup(
  group: CatalogGroup,
  presentGalleryTabs: ReadonlyArray<AddGalleryTab>,
): CatalogView[] {
  if (group !== "structure") return [...GROUP_VIEWS[group]];
  const present = new Set(presentGalleryTabs);
  const dynamic = STRUCTURE_GALLERY_TABS.filter((id) => present.has(id));
  return ["all", ...dynamic, "catalog_studio"];
}

/** The first (default) view of a group, given the present gallery tabs. Never
 *  empty — structure always has at least `all`, design/admin are non-empty. */
export function firstViewOfGroup(
  group: CatalogGroup,
  presentGalleryTabs: ReadonlyArray<AddGalleryTab>,
): CatalogView {
  return orderedViewsForGroup(group, presentGalleryTabs)[0];
}
