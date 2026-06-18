/**
 * registry-db-merge.ts — WS4.
 *
 * The Add Gallery is no longer code-only. `listGalleryItems(...)` returns the
 * union of:
 *   1. the existing CODE catalog (`ADD_GALLERY_ITEMS`), filtered to the
 *      surface's `galleryPolicy.allowedTabs`, and
 *   2. WS2's published DB templates (`listPublishedTemplates({...})`), each
 *      mapped to an `AddGalleryItem` with `insertMethod: "dbTemplate"`.
 *
 * The DB rows are filtered server-side by `listPublishedTemplates` (RLS +
 * target/plan/tab/dataSources). This module ALSO re-checks target/plan/tier
 * here (§E, defence-in-depth) so a row can never leak past the surface's policy
 * even if the upstream filter is loosened.
 *
 * TEST DISCIPLINE: the row→item mapper (`builderTemplateRowToGalleryItem`) and
 * the merge core (`mergeGalleryItems`) are PURE — no I/O, no React, no Supabase
 * at module load. `listGalleryItems` is the only async/server entry point; it
 * injects `listPublishedTemplates` + an asset-URL resolver so a test can drive
 * the whole merge with plain fakes (see registry-db-merge.test.ts).
 */

import type { BuilderGalleryPolicy } from "@/lib/site-admin/builder-core/config";
import type {
  BuilderGalleryTab,
  BuilderTemplateRow,
  BuilderTemplateTarget,
  ListPublishedTemplatesFilter,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import { templatePlanAllowed } from "@/lib/site-admin/builder-core/templates/registry-rows";
import { templateRolloutAllowed } from "@/lib/site-admin/builder-core/templates/rollout";

import { ADD_GALLERY_ITEMS } from "./registry";
import {
  applyStructureToItems,
  type CatalogStructureMap,
} from "./catalog-structure";
import type { AddGalleryItem, AddGalleryTab } from "./types";

// ── Plan rank (mirrors registry-rows.templatePlanAllowed / data-bindings PLAN_RANK) ──

type PlanKey = "free" | "studio" | "agency" | "network";

const PLAN_RANK: Record<PlanKey, number> = {
  free: 0,
  studio: 1,
  agency: 2,
  network: 3,
};

/** The MORE restrictive (higher) of two plan requirements. Null acts as "no
 *  requirement". Used so an overlay's required_plan_override can only TIGHTEN. */
function morePlanRestrictive(
  base: PlanKey | null | undefined,
  override: PlanKey | null | undefined,
): PlanKey | undefined {
  if (!override) return base ?? undefined;
  if (!base) return override;
  return PLAN_RANK[override] > PLAN_RANK[base] ? override : base;
}

// ── Catalog overlay (P3) ──────────────────────────────────────────────────────

/** One `builder_catalog_overlay` row. Absence = code/template defaults. */
export interface CatalogOverlayRow {
  item_ref: string;
  source: "code" | "template";
  /** LEGACY 2-toggle axis (kept for dual-write + back-compat). The day X4 lands
   *  these still drive any code path that hasn't been threaded a `surfaceKey`
   *  (e.g. a null-surface homepage/Lab merge, which never subtracts per-surface).
   *  The new per-surface quad below SUPERSEDES these where a `surfaceKey` is
   *  supplied. */
  talent_enabled: boolean;
  workspace_enabled: boolean;
  /** X4 — the four INDEPENDENT real-surface toggles. Optional so older overlay
   *  fixtures / the live DB during the migration window still typecheck; absence
   *  ⇒ fall back to the legacy pair (talent_* ⇐ talent_enabled, workspace_* ⇐
   *  workspace_enabled — see {@link surfaceEnabledForRow}). The DB supplies all
   *  four after the 20261106000300 migration backfills them losslessly. */
  talent_profile_enabled?: boolean;
  talent_shell_enabled?: boolean;
  workspace_page_enabled?: boolean;
  workspace_shell_enabled?: boolean;
  label_override: string | null;
  icon_override: string | null;
  category_override: string | null;
  required_plan_override: PlanKey | null;
  availability_override: "available" | "hidden" | null;
  // Builder Studio (Wave 0 plumbing; behavior in WS-C). Optional so existing
  // overlay-row constructors/tests don't need updating; the DB always supplies them.
  default_props?: Record<string, unknown> | null;
  locked_props?: string[];
  default_variant?: string | null;
  data_source_defaults?: Record<string, unknown> | null;
}

/** Overlay rows keyed by `item_ref` (= AddGalleryItem.id). */
export type CatalogOverlayMap = Record<string, CatalogOverlayRow>;

/**
 * Patch for `setComponentOverlay`. `item_ref` + `source` are required; the rest
 * are optional — an explicit `null` clears an override / re-enables a surface.
 */
export interface SetCatalogOverlayInput {
  item_ref: string;
  source: "code" | "template";
  /** LEGACY 2-toggle axis — writers dual-write these alongside the X4 quad so a
   *  rollback to pre-X4 code keeps reading correct visibility. */
  talent_enabled?: boolean;
  workspace_enabled?: boolean;
  /** X4 — the four INDEPENDENT real-surface toggles. A toggle from the 4-column
   *  Lab matrix sets exactly one of these; the writer mirrors the corresponding
   *  legacy column (AND of the two talent / two workspace surfaces) for safety. */
  talent_profile_enabled?: boolean;
  talent_shell_enabled?: boolean;
  workspace_page_enabled?: boolean;
  workspace_shell_enabled?: boolean;
  label_override?: string | null;
  icon_override?: string | null;
  category_override?: string | null;
  required_plan_override?: PlanKey | null;
  availability_override?: "available" | "hidden" | null;
  /** Builder Studio (WS-C C3) — admin default native variant applied at insert
   *  when the item has no explicit variant. `null` clears the override. */
  default_variant?: string | null;
  /** Builder Studio (WS-C C2) — admin component defaults: props deep-merged OVER
   *  the variant-resolved props at insert. `null` clears the override. */
  default_props?: Record<string, unknown> | null;
  /** Builder Studio (WS-C C4) — admin data-source defaults: a binding overlay
   *  (`{ filterQuery?, maxItems?, pinnedIds? }`) deep-merged into a connected
   *  node's `props.dataBinding` at insert. `null` clears the override. */
  data_source_defaults?: Record<string, unknown> | null;
  /** Builder Studio (WS-C) — dot-path prop keys a tenant may NOT edit. */
  locked_props?: string[] | null;
}

/**
 * One row of the Builder Lab Catalog admin view — the FULL ungated universe
 * (every code item + every published template) with its overlay state and the
 * computed effective per-surface visibility. Unlike the live gallery, hidden
 * items are STILL listed so a super-admin can re-enable them.
 */
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
  effectiveLabel: string;
  effectiveCategory: string;
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
      effectiveLabel: ov?.label_override ?? item.label,
      effectiveCategory,
    };
  });
}

// ── 4-surface matrix projection (X1, read-only) ──────────────────────────────

// The four-surface vocabulary + the PURE 2→4 lossless-migration helpers live in
// `surface-keys.ts` (split out to keep this file under the 800-line cap). They are
// RE-EXPORTED here so existing direct imports (`from "./registry-db-merge"`) — and
// the test discipline of never importing through the .css-laden barrel — keep
// working unchanged.
export {
  CATALOG_SURFACE_KEYS,
  CATALOG_SURFACE_LABEL,
  SURFACE_COLUMN,
  legacyToFourSurface,
  surfaceEnabledForRow,
  surfaceKeyToTarget,
  type CatalogSurfaceKey,
} from "./surface-keys";
import {
  CATALOG_SURFACE_KEYS,
  CATALOG_SURFACE_LABEL,
  SURFACE_COLUMN,
  surfaceEnabledForRow,
  surfaceKeyToTarget,
  type CatalogSurfaceKey,
} from "./surface-keys";

/** One cell of the derived 4-surface matrix. */
export interface CatalogSurfaceCell {
  key: CatalogSurfaceKey;
  /** Human label for the cell. */
  label: string;
  /** Effective visibility on this surface. */
  visible: boolean;
  /**
   * Which underlying toggle governs this cell.
   *
   *   • X4 (real) — when the view carries an independent `surfaceVisible` map,
   *     each surface is governed by its OWN per-surface column
   *     (`talent_profile_enabled` … `workspace_shell_enabled`).
   *   • Legacy (back-compat) — when only the 2-toggle
   *     `talentVisible`/`workspaceVisible` projection is supplied, the cell still
   *     reports the lossy `talent_enabled`/`workspace_enabled` it rides.
   */
  governedBy:
    | "talent_enabled"
    | "workspace_enabled"
    | "talent_profile_enabled"
    | "talent_shell_enabled"
    | "workspace_page_enabled"
    | "workspace_shell_enabled";
}

/**
 * Project a `CatalogAdminItem` onto the FOUR real builder surfaces (X1, PURE,
 * read-only). This is a *derivation* over the existing 2-toggle overlay state
 * (`talentVisible` ⇐ `talent_enabled`, `workspaceVisible` ⇐ `workspace_enabled`)
 * — it adds NO new column and performs NO write. Its sole job is to make the
 * current LOSSY mapping visible:
 *
 *   • talent profile  ⇐ talent_enabled        (`buildTalentPageBuilderConfig`,
 *                                               adapter target → "talent")
 *   • talent shell    ⇐ workspace_enabled      (THE SURPRISE — the talent Max
 *                                               SITE-SHELL is governed by the
 *                                               Workspace toggle because
 *                                               `buildSiteShellBuilderConfig`
 *                                               hardcodes surfaceTarget:'workspace')
 *   • workspace page  ⇐ workspace_enabled      (`buildCmsPageBuilderConfig`,
 *                                               surfaceTarget:'workspace')
 *   • workspace shell ⇐ workspace_enabled      (same site_shell config, workspace)
 *
 * So hiding a component "from Workspace" silently also hides it from the talent's
 * own Max-site header/footer — three of the four surfaces collapse onto one
 * toggle. X4 later splits this into a true 4-column matrix; this read-only view
 * de-risks that migration by exposing the truth first.
 *
 * Visibility per cell honors the item's `target_context` exactly as
 * `buildCatalogAdminView` does (talent-targeted rows can't show on workspace
 * surfaces and vice-versa; "both" shows on all) because we reuse the
 * already-computed `talentVisible`/`workspaceVisible`, keeping this a pure
 * projection of that view.
 */
export function deriveSurfaceMatrix(
  view: Pick<CatalogAdminItem, "talentVisible" | "workspaceVisible"> &
    Partial<Pick<CatalogAdminItem, "surfaceVisible">>,
): CatalogSurfaceCell[] {
  // X4 — when the view carries the REAL per-surface visibility map, each surface
  // reports its OWN independent toggle. The talent shell is now governed by
  // `talent_shell_enabled`, NOT the workspace toggle: the lossy 3-on-1 collapse
  // is gone. Callers that only pass the legacy 2-toggle projection (e.g. the X1
  // read-only test) fall through to the back-compat branch below, which keeps
  // documenting the OLD lossy reality so that path's tests stay meaningful.
  if (view.surfaceVisible) {
    const sv = view.surfaceVisible;
    return CATALOG_SURFACE_KEYS.map((key) => ({
      key,
      label: CATALOG_SURFACE_LABEL[key],
      visible: sv[key],
      governedBy: SURFACE_COLUMN[key] as CatalogSurfaceCell["governedBy"],
    }));
  }
  return [
    {
      key: "talent_profile",
      label: "Talent profile",
      visible: view.talentVisible,
      governedBy: "talent_enabled",
    },
    {
      key: "talent_shell",
      label: "Talent shell",
      visible: view.workspaceVisible,
      governedBy: "workspace_enabled",
    },
    {
      key: "workspace_page",
      label: "Workspace page",
      visible: view.workspaceVisible,
      governedBy: "workspace_enabled",
    },
    {
      key: "workspace_shell",
      label: "Workspace shell",
      visible: view.workspaceVisible,
      governedBy: "workspace_enabled",
    },
  ];
}

/**
 * Apply the admin overlay to an already-merged item list (PURE). Subtract-only:
 *   - `availability_override === "hidden"` → drop everywhere.
 *   - per-surface `*_enabled === false` → drop on that surface only.
 *   - `required_plan_override` → a TIGHTEN-only extra plan gate (never loosens;
 *     drops the item when the surface plan can't meet the override).
 *   - label / icon / category overrides are applied to the survivors.
 * X4 — when `ctx.surfaceKey` is set (one of the FOUR real surfaces) the
 * per-surface subtraction keys off that surface's INDEPENDENT toggle (via
 * {@link surfaceEnabledForRow}, which falls back losslessly to the legacy pair
 * for rows predating the migration). When `surfaceKey` is absent the legacy
 * coarse `ctx.surfaceTarget` 2-toggle subtraction applies, exactly as before.
 * "both"/"platform"/null surfaces (e.g. the homepage / Lab) are not subtracted
 * per-surface, only by availability.
 */
export function applyCatalogOverlay(
  items: ReadonlyArray<AddGalleryItem>,
  overlays: CatalogOverlayMap,
  ctx: GalleryMergeContext,
): AddGalleryItem[] {
  const surface = ctx.surfaceTarget;
  const surfaceKey = ctx.surfaceKey ?? null;
  const out: AddGalleryItem[] = [];
  for (const item of items) {
    const ov = overlays[item.id];
    if (!ov) {
      out.push(item);
      continue;
    }
    if (ov.availability_override === "hidden") continue;
    // X4 precise 4-surface subtraction takes precedence when a surfaceKey is
    // supplied; otherwise the legacy coarse target axis governs (back-compat).
    if (surfaceKey) {
      if (!surfaceEnabledForRow(ov, surfaceKey)) continue;
    } else {
      if (surface === "talent" && !ov.talent_enabled) continue;
      if (surface === "workspace" && !ov.workspace_enabled) continue;
    }
    if (
      ov.required_plan_override &&
      ctx.plan &&
      !templatePlanAllowed(ov.required_plan_override, ctx.plan)
    ) {
      continue;
    }
    out.push({
      ...item,
      label: ov.label_override ?? item.label,
      icon: ov.icon_override ?? item.icon,
      category: ov.category_override ?? item.category,
      requiredPlan: morePlanRestrictive(item.requiredPlan, ov.required_plan_override),
      // Builder Studio governance carry (Wave 0 plumbing; behavior in WS-C).
      defaultVariant: ov.default_variant ?? item.defaultVariant,
      defaultProps: ov.default_props ?? item.defaultProps,
      lockedProps:
        ov.locked_props && ov.locked_props.length > 0
          ? ov.locked_props
          : item.lockedProps,
      dataSourceDefaults: ov.data_source_defaults ?? item.dataSourceDefaults,
    });
  }
  return out;
}

// ── gallery_tab (DB) → AddGalleryTab (code) ──────────────────────────────────

/**
 * WS2 `gallery_tab` values are `sections | elements | connected | page_templates`.
 * Element/section/connected DB templates surface on their native tab so they sit
 * beside the code items of the same family; `page_templates` is the new tab.
 */
function dbGalleryTabToAddGalleryTab(tab: BuilderGalleryTab): AddGalleryTab {
  switch (tab) {
    case "elements":
      return "elements";
    case "sections":
      return "sections";
    case "connected":
      return "connected";
    case "page_templates":
      return "page_templates";
    // WS-A A7 — shell templates land on the shell-only tab (offered solely on
    // the site-shell surface via `allowedTabs`).
    case "shell":
      return "shell";
    default:
      return "page_templates";
  }
}

/** Stable, namespaced gallery-item id for a DB template row. */
export function dbTemplateGalleryItemId(rowId: string): string {
  return `db-template:${rowId}`;
}

// ── target_context gating (§E) ───────────────────────────────────────────────

/**
 * A surface viewing the gallery declares which subject it builds for
 * (`talent` | `workspace` | `platform`). A row is visible when its
 * `target_context` is `both` or matches the surface target.
 */
export function templateTargetAllowed(
  rowTarget: BuilderTemplateTarget,
  surfaceTarget: BuilderTemplateTarget | null | undefined,
): boolean {
  if (rowTarget === "both") return true;
  if (!surfaceTarget) return true; // no surface constraint → allow
  if (surfaceTarget === "both") return true;
  return rowTarget === surfaceTarget;
}

/**
 * Talent-tier gating (§E). A row may require a talent tier
 * (e.g. `talent_pro`). When the row requires a tier, the viewing surface must
 * supply a tier that meets/exceeds it. Workspace surfaces (no tier) only see
 * rows with no tier requirement.
 */
const TALENT_TIER_RANK: Record<string, number> = {
  talent_basic: 0,
  talent_pro: 1,
  talent_portfolio: 2,
};

export function templateTalentTierAllowed(
  rowTier: string | null | undefined,
  surfaceTier: string | null | undefined,
): boolean {
  if (!rowTier) return true; // no tier requirement
  const required = TALENT_TIER_RANK[rowTier];
  if (required === undefined) return true; // unknown tier → don't block
  const current = surfaceTier ? TALENT_TIER_RANK[surfaceTier] : undefined;
  if (current === undefined) return false; // row needs a tier; surface has none
  return current >= required;
}

// ── row → AddGalleryItem (PURE) ──────────────────────────────────────────────

/**
 * Map a published `builder_templates` row to an `AddGalleryItem` carrying the
 * `dbTemplate` insert method. PURE — `resolvePreviewImageUrl` is an injected,
 * already-resolved string (the caller resolves `thumbnail_asset_id` /
 * `hero_asset_id` → URL before calling, or passes undefined).
 */
export function builderTemplateRowToGalleryItem(
  row: BuilderTemplateRow,
  options?: { previewImageUrl?: string },
): AddGalleryItem {
  const tab = dbGalleryTabToAddGalleryTab(row.gallery_tab);
  return {
    id: dbTemplateGalleryItemId(row.id),
    label: row.title,
    description: row.description ?? "",
    tab,
    // row.category maps to AddGalleryCategoryDef.id; unknown categories still
    // render (the gallery falls back to the tab grouping).
    category: row.category,
    icon: tab === "page_templates" ? "layout" : "sparkle",
    previewType: options?.previewImageUrl ? "image-card" : "icon-card",
    itemKind: row.data_binding_requirements.length > 0 ? "connected" : "static",
    insertMethod: "dbTemplate",
    dragSupported: true,
    availability: "available",
    sourceType: "native-freeform",
    requiredPermission: undefined,
    searchTerms: [...row.tags, row.slug],
    previewImageUrl: options?.previewImageUrl,
    dbTemplateId: row.id,
    dbTemplateTree: row.builder_tree,
    requiredPlan: row.required_plan,
    targetContext: row.target_context,
    requiredTalentTier: row.required_talent_tier,
    // Builder Studio governance carry (Wave 0 plumbing; behavior in WS-C).
    defaultProps: row.default_props,
    lockedProps: row.locked_props,
    dataSourceDefaults: row.data_source_defaults,
    // Builder Studio staged rollout (WS-D D3) — carried so the live gate can
    // bucket the tenant. Undefined fields fall back to "fully rolled out".
    rolloutPercentage: row.rollout_percentage,
    rolloutAllowlist: row.tenant_allowlist,
    rolloutDenylist: row.tenant_denylist,
    ...(row.data_binding_requirements.length > 0
      ? { connectedSource: "Live data" }
      : {}),
  };
}

// ── merge core (PURE) ────────────────────────────────────────────────────────

export interface GalleryMergeContext {
  /** Surface gallery policy (which tabs + whether DB templates are offered). */
  galleryPolicy: BuilderGalleryPolicy;
  /** Surface subject target for target_context gating (§E). */
  surfaceTarget?: BuilderTemplateTarget | null;
  /**
   * X4 — the PRECISE builder surface for per-surface overlay subtraction. This
   * is ORTHOGONAL to `surfaceTarget`: `surfaceTarget` is the coarse audience
   * (talent|workspace) used for target_context gating; `surfaceKey` is the exact
   * one of FOUR real surfaces whose overlay toggle decides lifecycle
   * (enabled/disabled). When set, `applyCatalogOverlay` subtracts using the
   * matching per-surface column; when absent it falls back to the legacy
   * `surfaceTarget`-driven 2-toggle subtraction (back-compat — null-surface
   * homepage/Lab merges never carry a surfaceKey and stay availability-only).
   */
  surfaceKey?: CatalogSurfaceKey | null;
  /** Surface plan for required_plan gating (§E). */
  plan?: PlanKey | null;
  /** Surface talent tier for required_talent_tier gating (§E). */
  talentTier?: string | null;
  /** Builder Studio — live tenant id for staged-rollout bucketing (WS-D). */
  tenantId?: string | null;
}

/**
 * The CODE catalog filtered to the surface's allowed tabs (pure).
 */
export function codeGalleryItemsForPolicy(
  galleryPolicy: BuilderGalleryPolicy,
): AddGalleryItem[] {
  const allowed = new Set<AddGalleryTab>(galleryPolicy.allowedTabs);
  return ADD_GALLERY_ITEMS.filter((item) => allowed.has(item.tab));
}

/**
 * Re-apply §E gating to already-mapped DB items, drop any whose tab the
 * surface does not allow, and (when DB templates are disabled by policy)
 * suppress them entirely. PURE.
 */
export function gateDbGalleryItems(
  items: ReadonlyArray<AddGalleryItem>,
  ctx: GalleryMergeContext,
): AddGalleryItem[] {
  if (!ctx.galleryPolicy.allowDbTemplates) return [];
  const allowedTabs = new Set<AddGalleryTab>(ctx.galleryPolicy.allowedTabs);
  return items.filter((item) => {
    if (item.insertMethod !== "dbTemplate") return false;
    if (!allowedTabs.has(item.tab)) return false;
    if (!templateTargetAllowed(item.targetContext ?? "both", ctx.surfaceTarget)) {
      return false;
    }
    if (
      ctx.plan &&
      !templatePlanAllowed(item.requiredPlan ?? "free", ctx.plan)
    ) {
      return false;
    }
    if (!templateTalentTierAllowed(item.requiredTalentTier, ctx.talentTier)) {
      return false;
    }
    // Staged rollout (WS-D D3): a published row may be canaried to a fraction of
    // tenants (or allow/deny-listed). A null tenant context (platform / Lab)
    // always passes — authors are never hidden from. `item.dbTemplateId` is the
    // row id used for deterministic bucketing.
    if (
      !templateRolloutAllowed(
        {
          id: item.dbTemplateId ?? item.id,
          rollout_percentage: item.rolloutPercentage,
          tenant_allowlist: item.rolloutAllowlist
            ? [...item.rolloutAllowlist]
            : null,
          tenant_denylist: item.rolloutDenylist
            ? [...item.rolloutDenylist]
            : null,
        },
        ctx.tenantId,
      )
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Merge the code catalog (allowed tabs) with gated DB items. PURE.
 * DB items are appended after code items so the curated, always-available code
 * catalog leads each tab.
 */
export function mergeGalleryItems(
  dbItems: ReadonlyArray<AddGalleryItem>,
  ctx: GalleryMergeContext,
): AddGalleryItem[] {
  const code = codeGalleryItemsForPolicy(ctx.galleryPolicy);
  const db = gateDbGalleryItems(dbItems, ctx);
  return [...code, ...db];
}

// ── async entry point (server) ───────────────────────────────────────────────

/**
 * Injected dependencies for `listGalleryItems`. Server callers use the real
 * `listPublishedTemplates` action + an asset-URL resolver; tests inject fakes.
 */
export interface ListGalleryItemsDeps {
  listPublishedTemplates: (
    filter?: ListPublishedTemplatesFilter,
  ) => Promise<
    | { ok: true; data: BuilderTemplateRow[] }
    | { ok: false; error: string }
  >;
  /**
   * Resolve a template row's preview image (thumbnail first, hero fallback) to a
   * public URL. May be async (storage lookup) or omitted (icon-card fallback).
   */
  resolvePreviewImageUrl?: (
    row: BuilderTemplateRow,
  ) => Promise<string | undefined> | string | undefined;
  /**
   * Load the admin catalog overlay (P3). When provided, the merged set is
   * passed through `applyCatalogOverlay` (subtract-only visibility + metadata
   * overrides) before returning. Applies to BOTH code items and DB templates.
   * Omitted (or returning {}) → no overlay, code/template defaults stand.
   */
  loadOverlays?: () => Promise<CatalogOverlayMap>;
  /**
   * Load the catalog STRUCTURE map (WS-B). When provided, items are passed
   * through `applyStructureToItems` (tab/category placement overrides) AFTER the
   * overlay. Omitted (or returning {}) → code-default tab/category placement.
   */
  loadStructure?: () => Promise<CatalogStructureMap>;
}

/**
 * WS4 entry point. Returns the merged gallery (code catalog ∪ published DB
 * templates) for a surface, gated by policy + §E.
 *
 * `galleryPolicy` selects the visible tabs and toggles DB templates. The wider
 * `context` carries the surface target/plan/tier used for §E gating. When the
 * surface forbids DB templates, only the code catalog is returned and
 * `listPublishedTemplates` is never called.
 */
export async function listGalleryItems(
  context: GalleryMergeContext,
  deps: ListGalleryItemsDeps,
): Promise<AddGalleryItem[]> {
  // Build the base set (code-only or code ∪ gated DB templates), then apply the
  // admin overlay once at the end so it governs BOTH populations uniformly.
  const overlays = deps.loadOverlays
    ? await deps.loadOverlays().catch(() => ({}) as CatalogOverlayMap)
    : null;
  const structure = deps.loadStructure
    ? await deps.loadStructure().catch(() => ({}) as CatalogStructureMap)
    : null;
  // Overlay first (visibility/label/icon/plan), then structure (tab/category
  // placement) — independent concerns; structure wins on placement because it is
  // the explicit "move this component" control. Empty inputs ⇒ identity.
  const finalize = (items: AddGalleryItem[]): AddGalleryItem[] => {
    const withOverlay = overlays ? applyCatalogOverlay(items, overlays, context) : items;
    return structure ? applyStructureToItems(withOverlay, structure) : withOverlay;
  };

  if (!context.galleryPolicy.allowDbTemplates) {
    // DB templates suppressed → code-only, no DB round-trip.
    return finalize(codeGalleryItemsForPolicy(context.galleryPolicy));
  }

  const result = await deps.listPublishedTemplates({
    targetContext: context.surfaceTarget ?? null,
    plan: context.plan ?? null,
  });

  if (!result.ok) {
    // Never fail the gallery on a template-fetch error — fall back to code-only.
    return finalize(codeGalleryItemsForPolicy(context.galleryPolicy));
  }

  const dbItems: AddGalleryItem[] = [];
  for (const row of result.data) {
    const previewImageUrl = deps.resolvePreviewImageUrl
      ? await deps.resolvePreviewImageUrl(row)
      : undefined;
    dbItems.push(
      builderTemplateRowToGalleryItem(row, { previewImageUrl }),
    );
  }

  return finalize(mergeGalleryItems(dbItems, context));
}
