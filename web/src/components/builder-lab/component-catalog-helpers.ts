/**
 * ComponentCatalog pure helpers + constants — lifted verbatim out of
 * component-catalog.tsx (god-file decomposition, no behavior change). These are
 * the catalog's stateless building blocks: tab/category constants, the
 * placeholder edit-form bundle, and the pure parse/format helpers the catalog
 * controller imports.
 */

import {
  ADD_GALLERY_CATEGORIES,
  type AddGalleryTab,
  type CatalogAdminItem,
} from "@/lib/site-admin/add-gallery";
import type { CatalogSurfaceKey } from "@/lib/site-admin/add-gallery/registry-db-merge";
import { CODE_TAB_DEFS } from "@/lib/site-admin/add-gallery/catalog-structure";
import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";
import type { CatalogEditFormBundle } from "./catalog-row-table";

// Single source — derived from the Builder Studio catalog-structure resolver
// (was duplicated with add-gallery-panel.tsx's TAB_DEFS). WS-B threads loaded
// structure for admin tab rename/reorder; code defaults verbatim otherwise.
export const ALL_TABS: ReadonlyArray<AddGalleryTab> = CODE_TAB_DEFS.map((t) => t.id);

// Canonical page-template starter intent categories (from the page-design ids)
// + the Playground draft bucket — passed to the catalog-health orphaned-category
// check as "known" so built-in starters aren't false-flagged.
export const KNOWN_TEMPLATE_CATEGORIES: ReadonlyArray<string> = [
  ...PAGE_DESIGN_SUMMARIES.map((d) => d.id),
  "playground",
];

// X4 — the overlay-input column written when toggling each of the four surfaces.
export const SURFACE_ENABLED_COLUMN: Record<
  CatalogSurfaceKey,
  | "talent_profile_enabled"
  | "talent_shell_enabled"
  | "workspace_page_enabled"
  | "workspace_shell_enabled"
> = {
  talent_profile: "talent_profile_enabled",
  talent_shell: "talent_shell_enabled",
  workspace_page: "workspace_page_enabled",
  workspace_shell: "workspace_shell_enabled",
};
// SPECIAL_TABS / CatalogView / VIEW_LABEL / isSpecialTab / TRAILING_SPECIAL_TABS
// were lifted into catalog-nav.ts (P1) so the pure view-taxonomy is one source,
// re-imported here.

const CATEGORY_LABEL = new Map(
  ADD_GALLERY_CATEGORIES.map((c) => [c.id, c.label] as const),
);

// O9 — placeholder values for CatalogRowTable's (required) flat edit-form props.
// Under multi-open these are NEVER read — each open editor's values come from
// `multiEdit.formFor(id)`. They only satisfy the prop contract so the row table
// stays backward-compatible (the flat props remain required for legacy callers).
const NOOP = () => {};
export const PLACEHOLDER_EDIT_FORM_PROPS: CatalogEditFormBundle = {
  editLabel: "",
  setEditLabel: NOOP,
  editCategory: "",
  setEditCategory: NOOP,
  editIcon: "",
  setEditIcon: NOOP,
  editPlan: "",
  setEditPlan: NOOP,
  editLockedProps: "",
  setEditLockedProps: NOOP,
  editDefaultVariant: "",
  setEditDefaultVariant: NOOP,
  editDefaultProps: "",
  setEditDefaultProps: NOOP,
  editDefaultPropsError: null,
  setEditDefaultPropsError: NOOP,
  editDataSourceDefaults: "",
  setEditDataSourceDefaults: NOOP,
  editDataSourceDefaultsError: null,
  setEditDataSourceDefaultsError: NOOP,
};

export function humanize(id: string): string {
  return (
    CATEGORY_LABEL.get(id) ??
    id
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

// The Connected view is split by which DATA the component binds: talent-roster /
// collection / directory sources → "Talent Data"; agency profile / booking /
// inquiry sources → "Agency Data". The surface switcher shows one at a time
// (Agency first, matching Site Defaults). This is a DISPLAY grouping (derived
// from the stable `connectedSource`, not from target_context), so it never
// changes the real per-surface gating — that stays controlled by the Talent-Max
// / Workspace toggles on each row.
export const CONNECTED_DATA_GROUPS = [
  { key: "agency", label: "Agency Data" },
  { key: "talent", label: "Talent Data" },
] as const;
export type ConnectedDataGroup = (typeof CONNECTED_DATA_GROUPS)[number]["key"];

export function connectedDataGroupOf(item: CatalogAdminItem): ConnectedDataGroup {
  const src = item.connectedSource ?? "";
  return src === "Talent Collection" || src === "Talent Directory"
    ? "talent"
    : "agency";
}

/** Parse the "Locked props" textarea (comma/newline/space-separated dot-paths)
 *  into the normalized `locked_props` array. Empty ⇒ [] (clears the lock). */
export function parseLockedProps(raw: string): string[] {
  const seen = new Set<string>();
  for (const tok of raw.split(/[\s,]+/)) {
    const key = tok.trim();
    if (key) seen.add(key);
  }
  return Array.from(seen);
}

/** Parse a JSON-object textarea. Empty ⇒ null (clears the override). Invalid
 *  JSON or a non-object → `{ error }` so the caller can show an inline message
 *  and block the save. `noun` names the field in the error copy. */
export function parseJsonObjectField(
  raw: string,
  noun: string,
): { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: `${noun} must be a JSON object.` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}
