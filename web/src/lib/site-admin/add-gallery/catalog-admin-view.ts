/**
 * catalog-admin-view.ts — the PURE Catalog admin-view projection
 * (`buildCatalogAdminView` + its `CatalogAdminItem` row shape), split out of
 * `registry-db-merge.ts` to keep that file under the 800-line `max-lines` cap.
 *
 * Imports its runtime deps from the already-extracted leaf modules
 * (`gallery-policy`, `surface-keys`, `component-usage-scan`) so there is no
 * runtime cycle with `registry-db-merge`; the only back-reference
 * (`CatalogOverlayRow` / `CatalogOverlayMap`) is a TYPE-ONLY import (erased).
 * RE-EXPORTED from `registry-db-merge` so existing `from "./registry-db-merge"`
 * imports keep working unchanged.
 */
import type {
  CatalogOverlayMap,
  CatalogOverlayRow,
} from "./registry-db-merge";
import type { BuilderTemplateTarget } from "@/lib/site-admin/builder-core/templates/registry-rows";
import type { CatalogStructureMap } from "./catalog-structure";
import {
  usageCountForItem,
  type ComponentUsageTally,
} from "./component-usage-scan";
import { templateTargetAllowed } from "./gallery-policy";
import {
  CATALOG_SURFACE_KEYS,
  labEnabledForRow,
  surfaceEnabledForRow,
  surfaceKeyToTarget,
  type CatalogSurfaceKey,
} from "./surface-keys";
import type { AddGalleryItem, AddGalleryTab } from "./types";

export interface CatalogAdminItem {
  id: string;
  tab: AddGalleryTab;
  source: "code" | "template";
  /** For DB-template rows, the raw `builder_templates` row id (the namespaced
   *  gallery `id` is `db-template:<dbTemplateId>`). The lifecycle actions
   *  (publishTemplate / archiveTemplate / …) take this raw id. Undefined for
   *  code rows. */
  dbTemplateId?: string;
  /** Lifecycle status. DB templates: the row's status enum
   *  (draft|in_review|published|archived). Code items have no lifecycle row, so
   *  this is DERIVED from `availability_override` — 'archived' when hidden,
   *  'published' otherwise (the only two states a code row can hold). */
  status: string;
  itemKind: AddGalleryItem["itemKind"];
  availability: AddGalleryItem["availability"];
  targetContext: BuilderTemplateTarget;
  /** The bound data source for connected items (e.g. "Talent Collection",
   *  "Agency Profile") — drives the Catalog's Talent-Data / Agency-Data grouping
   *  of the Connected view. Undefined for non-connected items. */
  connectedSource: AddGalleryItem["connectedSource"];
  baseLabel: string;
  baseCategory: string;
  baseIcon: string;
  overlay: CatalogOverlayRow | null;
  talentVisible: boolean;
  workspaceVisible: boolean;
  /**
   * X4 — effective visibility on EACH of the four real surfaces, computed from
   * target_context ∩ the per-surface overlay toggle (honoring the new columns,
   * losslessly falling back to the legacy pair). This is the REAL matrix the
   * 4-column Lab table renders; `talentVisible`/`workspaceVisible` are retained
   * for the legacy 2-toggle controls + back-compat callers.
   */
  surfaceVisible: Record<CatalogSurfaceKey, boolean>;
  /**
   * X6 — effective visibility in the Builder LAB itself: the independent
   * `lab_enabled` overlay toggle ∩ not availability-hidden. ORTHOGONAL to the
   * four tenant surfaces and to `target_context` — a component can be hidden from
   * every tenant surface yet still Lab-visible (and vice-versa). The 5th matrix
   * column renders this; it never collapses onto any tenant-surface toggle.
   */
  labVisible: boolean;
  effectiveLabel: string;
  effectiveCategory: string;
  /**
   * D1 — how many tenant trees reference this component's TYPE, aggregated
   * across every tenant tree-bearing column (cms_pages.blocks /
   * cms_sections.props_jsonb / cms_builder_components.subtree_jsonb /
   * talent_sites snapshots + shell). Resolved by `applyUsageCounts` from the
   * platform-wide `ComponentUsageTally` (native items key on `nativeKind`,
   * curated section embeds on `sectionEmbedKey`). `undefined` ⇒ the item has no
   * single countable TYPE (a DB page/section template is inlined as a whole
   * subtree, not one node kind) → the UI renders "—"; a NUMBER (incl. 0) ⇒ a
   * real type, used on N tenant pages.
   */
  usageCount?: number;
  /** D6 — component-identity keys (mirrored from the source AddGalleryItem) so a
   *  where-used confirm can build a HideImpactRef. Native items carry `nativeKind`;
   *  curated section embeds carry `sectionEmbedKey`; DB templates carry neither. */
  nativeKind?: AddGalleryItem["nativeKind"];
  sectionEmbedKey?: AddGalleryItem["sectionEmbedKey"];
}

/**
 * Compute the Catalog admin view (PURE) from the ungated universe + overlays.
 * Effective visibility = target_context allows the surface AND the overlay
 * doesn't disable it AND it isn't availability-hidden. Code items target "both".
 *
 * CATEGORY/TAB PRECEDENCE — must match the LIVE "+" gallery (F4). The live read
 * path (`listGalleryItems` → finalize) applies the overlay FIRST, then the
 * catalog structure, so a structure `item:<id>` placement WINS over an overlay
 * `category_override` ("structure wins on placement" — it is the explicit
 * 'move this component' control). To keep the Lab == live, this view resolves
 * placement the SAME way: base → overlay.category_override → structure
 * (`item:<id>`) tab/category override. The optional `structure` arg is threaded
 * by `loadCatalogAdminView`; omitted ⇒ overlay-only placement (identity for
 * existing callers/tests). `baseCategory` is the genuine code/template default
 * (pre-overlay, pre-structure) so the override-input placeholder shows the real
 * baseline, and `tab`/`effectiveCategory` are the live-resolved placement.
 *
 * NOTE: talentVisible/workspaceVisible intentionally IGNORE required_plan and
 * required_talent_tier gating, which the live consumer gallery DOES apply
 * (applyCatalogOverlay / listPublishedTemplates). So a column shown "visible"
 * here can still be hidden on a specific live builder whose plan/tier doesn't
 * meet a row's requirement — this answers "is it enabled for the surface", not
 * "will every builder on that surface see it".
 */
export function buildCatalogAdminView(
  universe: ReadonlyArray<AddGalleryItem>,
  overlays: CatalogOverlayMap,
  statusByRef?: Record<string, string>,
  structure: CatalogStructureMap = {},
  // D1 — the platform-wide component-TYPE usage tally. When supplied, each row's
  // `usageCount` is resolved from it (native items key on `nativeKind`, curated
  // section embeds on `sectionEmbedKey`). Omitted ⇒ `usageCount` stays undefined
  // (identity for existing callers/tests) and the UI renders "—".
  usageTally?: ComponentUsageTally,
): CatalogAdminItem[] {
  return universe.map((item) => {
    const source: "code" | "template" =
      item.insertMethod === "dbTemplate" ? "template" : "code";
    const ov = overlays[item.id] ?? null;
    const structRow = structure[`item:${item.id}`] ?? null;
    const hidden = ov?.availability_override === "hidden";
    // Lifecycle status. DB templates carry a real status enum
    // (draft|in_review|published|archived). Code items have NO lifecycle row, so
    // we DERIVE one from their `availability_override`: hidden → archived,
    // otherwise published. This replaces the synthetic 'built-in' literal so the
    // Catalog UI reflects the only two states a code row can actually hold
    // (Published / Archived), driven by the same overlay the live gallery honors.
    const status =
      source === "template"
        ? statusByRef?.[item.id] ?? "published"
        : hidden
          ? "archived"
          : "published";
    const targetContext: BuilderTemplateTarget = item.targetContext ?? "both";
    const talentVisible =
      templateTargetAllowed(targetContext, "talent") &&
      (ov ? ov.talent_enabled : true) &&
      !hidden;
    const workspaceVisible =
      templateTargetAllowed(targetContext, "workspace") &&
      (ov ? ov.workspace_enabled : true) &&
      !hidden;
    // X4 — the REAL 4-surface visibility: target_context (coarse) ∩ the precise
    // per-surface overlay toggle ∩ not availability-hidden. Each surface keys off
    // its own independent column now (lossless legacy fallback baked into
    // surfaceEnabledForRow), so the talent shell is no longer chained to workspace.
    const surfaceVisible = CATALOG_SURFACE_KEYS.reduce(
      (acc, key) => {
        acc[key] =
          templateTargetAllowed(targetContext, surfaceKeyToTarget(key)) &&
          surfaceEnabledForRow(ov, key) &&
          !hidden;
        return acc;
      },
      {} as Record<CatalogSurfaceKey, boolean>,
    );
    // X6 — the INDEPENDENT Builder-Lab visibility: the lab_enabled overlay toggle
    // ∩ not availability-hidden. Deliberately NOT gated by target_context (the Lab
    // authors for ALL audiences) and NOT chained to any tenant surface.
    const labVisible = labEnabledForRow(ov) && !hidden;
    // LIVE-MATCHING placement (F4): base → overlay → structure, structure wins.
    // Mirrors the live finalize() order (applyCatalogOverlay then
    // applyStructureToItems). `item.tab`/`item.category` here are the genuine
    // base (loadCatalogAdminView passes the raw universe, NOT pre-structured).
    const effectiveTab: AddGalleryTab =
      (structRow?.parent_tab as AddGalleryTab | null | undefined) ?? item.tab;
    const effectiveCategory =
      structRow?.category_override ?? ov?.category_override ?? item.category;
    return {
      id: item.id,
      tab: effectiveTab,
      source,
      dbTemplateId: source === "template" ? item.dbTemplateId : undefined,
      status,
      itemKind: item.itemKind,
      availability: item.availability,
      targetContext,
      connectedSource: item.connectedSource,
      baseLabel: item.label,
      baseCategory: item.category,
      baseIcon: item.icon,
      overlay: ov,
      talentVisible,
      workspaceVisible,
      surfaceVisible,
      labVisible,
      effectiveLabel: ov?.label_override ?? item.label,
      effectiveCategory,
      usageCount: usageTally
        ? usageCountForItem(item, usageTally)
        : undefined,
      // D6 — the component-identity keys (carried through so the where-used
      // confirm can build a HideImpactRef for a code-row without re-deriving).
      nativeKind: item.nativeKind,
      sectionEmbedKey: item.sectionEmbedKey,
    };
  });
}
