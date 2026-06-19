/**
 * O10 — the unified "All" superset index: pure flatten + facet + sort logic for
 * the Builder Lab Catalog's first tab, which audits the WHOLE governed universe
 * on one screen.
 *
 * Three sources fold into ONE flat row list:
 *   • code components — the built-in `+`-gallery items (`CatalogAdminItem` with
 *     `source === "code"`). Their lifecycle is the derived Published/Archived
 *     pair (no `builder_templates` row), so they never show draft / in_review.
 *   • published templates — the `CatalogAdminItem`s whose `source === "template"`
 *     (a `builder_templates` row already surfaced in the gallery, i.e. published
 *     into a gallery tab). These carry overlay state, so "Customized?" is real.
 *   • draft / in_review / archived templates — every OTHER `builder_templates`
 *     row from `listAllTemplates()` that is NOT already represented as a catalog
 *     item (matched on `dbTemplateId`). These are the stuck-in-review / unshipped
 *     rows the gallery can't show — surfacing them here is the whole point.
 *
 * No React, no DB — the table component owns rendering + the facet UI; this owns
 * "given the gallery items + the full template set, what is the deduped flat row
 * list, its facet counts, and the filtered/sorted view". Unit-tested directly.
 */

import type {
  CatalogAdminItem,
  AddGalleryTab,
} from "@/lib/site-admin/add-gallery";
import type {
  BuilderTemplateRow,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
// surface-keys.ts is a CSS-free leaf — safe to import from this pure module so
// the tsx test runner never drags in the add-gallery barrel's .css side-effect.
import { labEnabledForRow } from "@/lib/site-admin/add-gallery/surface-keys";

/** Where a unified row originated. Drives the Source column + facet group. */
export type AllIndexSource = "code" | "template" | "draft";

/** One flattened row of the superset index. Columns: Source / Tab / Target /
 *  Status / Plan / Customized? — plus the label + id used for search + jump. */
export interface AllIndexRow {
  /** Stable unique key (source-namespaced) — React key + dedupe identity. */
  key: string;
  source: AllIndexSource;
  /** The catalog row id (code/template) or `db-template:<id>` (draft). Used to
   *  jump into the owning view. */
  id: string;
  /** Raw `builder_templates` row id for template/draft rows (undefined for code);
   *  the lifecycle target a jump-to-manager would act on. */
  dbTemplateId?: string;
  label: string;
  /** Gallery tab the row lives in. `null` for drafts not yet placed in a tab
   *  (they have a `gallery_tab` but aren't surfaced) — rendered as "—". */
  tab: AddGalleryTab | null;
  /** Human gallery-tab token (the raw tab string) for display + search. */
  tabLabel: string;
  target: BuilderTemplateTarget;
  status: BuilderTemplateStatus;
  plan: "free" | "studio" | "agency" | "network";
  /** Whether an overlay customizes this row (renames / gating / locked props).
   *  Drafts have no gallery overlay so they're never "customized" here. */
  customized: boolean;
}

/** A draft-kind template is one whose status is NOT published — i.e. it can't be
 *  in the gallery yet (or was unshipped). We surface these from listAllTemplates
 *  only if they aren't ALSO present as a catalog item. */
function isPublishedTemplateStatus(status: BuilderTemplateStatus): boolean {
  return status === "published";
}

/** Does the row carry ANY overlay customization (not just enabled toggles)? An
 *  overlay row exists iff at least one column was set; we treat the mere
 *  presence of `overlay` as "customized" — matching the Catalog's "Customized"
 *  filter mode (which keys off `r.overlay` truthiness). */
function rowIsCustomized(item: CatalogAdminItem): boolean {
  return Boolean(item.overlay);
}

/** The label a `builder_templates` row shows in the index. */
function templateRowLabel(t: BuilderTemplateRow): string {
  return t.title || t.slug || t.id;
}

/**
 * Flatten the gallery items + the full template set into ONE deduped row list.
 *
 * Dedupe rule: a `builder_templates` row already represented as a catalog item
 * (its raw id appears as some item's `dbTemplateId`) is NOT re-added from the
 * template set — the catalog item is the richer record (carries overlay state).
 * Only templates with NO catalog item (the draft / in_review / archived / never-
 * surfaced rows) are appended as `source: "draft"`.
 */
export function buildAllIndex(
  items: ReadonlyArray<CatalogAdminItem>,
  templates: ReadonlyArray<BuilderTemplateRow>,
): AllIndexRow[] {
  const rows: AllIndexRow[] = [];
  // Track which raw template ids are already covered by a catalog item so the
  // template-set pass can skip them.
  const coveredTemplateIds = new Set<string>();

  for (const item of items) {
    if (item.dbTemplateId) coveredTemplateIds.add(item.dbTemplateId);
    const source: AllIndexSource = item.source === "template" ? "template" : "code";
    rows.push({
      key: `${source}:${item.id}`,
      source,
      id: item.id,
      dbTemplateId: item.dbTemplateId,
      label: item.effectiveLabel,
      tab: item.tab,
      tabLabel: item.tab,
      target: item.targetContext,
      // CatalogAdminItem.status is a string; narrow to the lifecycle union (code
      // rows resolve to published/archived, template rows to the real enum).
      status: (item.status as BuilderTemplateStatus) ?? "published",
      plan:
        (item.overlay?.required_plan_override as AllIndexRow["plan"] | null | undefined) ??
        "free",
      customized: rowIsCustomized(item),
    });
  }

  for (const t of templates) {
    if (coveredTemplateIds.has(t.id)) continue;
    // A published template not in the catalog item set is unusual (it should be
    // surfaced) — but if it occurs, classify by status so the Source column is
    // honest: published → "template", anything else → "draft".
    const source: AllIndexSource = isPublishedTemplateStatus(t.status)
      ? "template"
      : "draft";
    rows.push({
      key: `${source}:db-template:${t.id}`,
      source,
      id: `db-template:${t.id}`,
      dbTemplateId: t.id,
      label: templateRowLabel(t),
      // A bare template row carries a gallery_tab string; it isn't an
      // AddGalleryTab placement until surfaced, so display the raw token and
      // leave the typed `tab` null (the table renders "—" for null).
      tab: null,
      tabLabel: t.gallery_tab,
      target: t.target_context,
      status: t.status,
      plan: t.required_plan,
      customized: false,
    });
  }

  return rows;
}

// ── Facets ────────────────────────────────────────────────────────────────────

/** The facet dimensions the All-index bar filters on. `null` in a selection ⇒
 *  "all" for that dimension. */
export interface AllIndexFacets {
  source: AllIndexSource | null;
  status: BuilderTemplateStatus | null;
  target: BuilderTemplateTarget | null;
  plan: AllIndexRow["plan"] | null;
  /** `true` ⇒ only customized rows; `false` ⇒ only non-customized; `null` ⇒ all. */
  customized: boolean | null;
  /** Free-text query over label + id + tab. */
  query: string;
}

export function emptyFacets(): AllIndexFacets {
  return {
    source: null,
    status: null,
    target: null,
    plan: null,
    customized: null,
    query: "",
  };
}

/** Per-value counts for each facet dimension, computed over the FULL row set
 *  (not the filtered view) so the bar shows totals like "Drafts (4)". */
export interface AllIndexFacetCounts {
  total: number;
  source: Record<AllIndexSource, number>;
  status: Record<BuilderTemplateStatus, number>;
  target: Record<BuilderTemplateTarget, number>;
  plan: Record<AllIndexRow["plan"], number>;
  customized: number;
}

export function facetCounts(rows: ReadonlyArray<AllIndexRow>): AllIndexFacetCounts {
  const counts: AllIndexFacetCounts = {
    total: rows.length,
    source: { code: 0, template: 0, draft: 0 },
    status: { draft: 0, in_review: 0, published: 0, archived: 0 },
    target: { talent: 0, workspace: 0, both: 0, platform: 0 },
    plan: { free: 0, studio: 0, agency: 0, network: 0 },
    customized: 0,
  };
  for (const r of rows) {
    counts.source[r.source] += 1;
    counts.status[r.status] += 1;
    counts.target[r.target] += 1;
    counts.plan[r.plan] += 1;
    if (r.customized) counts.customized += 1;
  }
  return counts;
}

/** Apply the facet selection + free-text query. Pure; returns a new array. */
export function applyAllIndexFilters(
  rows: ReadonlyArray<AllIndexRow>,
  facets: AllIndexFacets,
): AllIndexRow[] {
  const q = facets.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (facets.source !== null && r.source !== facets.source) return false;
    if (facets.status !== null && r.status !== facets.status) return false;
    if (facets.target !== null && r.target !== facets.target) return false;
    if (facets.plan !== null && r.plan !== facets.plan) return false;
    if (facets.customized !== null && r.customized !== facets.customized) return false;
    if (q) {
      const hay = `${r.label} ${r.id} ${r.tabLabel}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ── Sort ──────────────────────────────────────────────────────────────────────

/** The columns the index sorts on (1:1 with the table headers). */
export type AllIndexSortKey =
  | "source"
  | "tab"
  | "target"
  | "status"
  | "plan"
  | "label"
  | "customized";

export type SortDir = "asc" | "desc";

export interface AllIndexSort {
  key: AllIndexSortKey;
  dir: SortDir;
}

// Stable display orders so an ascending sort reads logically (not alphabetically)
// for the enum-ish columns. Lower index sorts first under `asc`.
const SOURCE_ORDER: Record<AllIndexSource, number> = {
  code: 0,
  template: 1,
  draft: 2,
};
// Status order surfaces the "needs attention" rows first under asc:
// in_review (stuck) → draft → published → archived.
const STATUS_ORDER: Record<BuilderTemplateStatus, number> = {
  in_review: 0,
  draft: 1,
  published: 2,
  archived: 3,
};
const TARGET_ORDER: Record<BuilderTemplateTarget, number> = {
  talent: 0,
  workspace: 1,
  both: 2,
  platform: 3,
};
const PLAN_ORDER: Record<AllIndexRow["plan"], number> = {
  free: 0,
  studio: 1,
  agency: 2,
  network: 3,
};

/** Comparator value for a row on a given key (numbers for enum columns, strings
 *  for label/tab). */
function rankFor(row: AllIndexRow, key: AllIndexSortKey): number | string {
  switch (key) {
    case "source":
      return SOURCE_ORDER[row.source];
    case "status":
      return STATUS_ORDER[row.status];
    case "target":
      return TARGET_ORDER[row.target];
    case "plan":
      return PLAN_ORDER[row.plan];
    case "customized":
      return row.customized ? 0 : 1;
    case "tab":
      return row.tabLabel.toLowerCase();
    case "label":
    default:
      return row.label.toLowerCase();
  }
}

/** Sort a row list (pure; returns a new array). Ties break on label asc so the
 *  order is deterministic regardless of input order. */
export function sortAllIndex(
  rows: ReadonlyArray<AllIndexRow>,
  sort: AllIndexSort,
): AllIndexRow[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ra = rankFor(a, sort.key);
    const rb = rankFor(b, sort.key);
    let cmp: number;
    if (typeof ra === "number" && typeof rb === "number") cmp = ra - rb;
    else cmp = String(ra).localeCompare(String(rb));
    if (cmp !== 0) return cmp * factor;
    // Deterministic tiebreak — label asc, then key asc (independent of dir).
    const lt = a.label.toLowerCase().localeCompare(b.label.toLowerCase());
    if (lt !== 0) return lt;
    return a.key.localeCompare(b.key);
  });
}

/** Convenience: full pipeline — flatten → filter → sort. Handy for the table
 *  component + a single-call test of the end-to-end shape. The `lab` arg is
 *  reserved for future Lab-visibility facets; computed here so callers needn't
 *  re-derive it. */
export function buildFilteredSortedIndex(
  items: ReadonlyArray<CatalogAdminItem>,
  templates: ReadonlyArray<BuilderTemplateRow>,
  facets: AllIndexFacets,
  sort: AllIndexSort,
): { all: AllIndexRow[]; view: AllIndexRow[]; counts: AllIndexFacetCounts } {
  const all = buildAllIndex(items, templates);
  const counts = facetCounts(all);
  const view = sortAllIndex(applyAllIndexFilters(all, facets), sort);
  return { all, view, counts };
}

/** Re-export so the table component can show whether a row is Lab-visible
 *  without re-importing the surface-keys leaf. (Code/template rows only.) */
export function labVisibleForItem(item: CatalogAdminItem): boolean {
  return labEnabledForRow(item.overlay);
}
