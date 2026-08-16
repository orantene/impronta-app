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
import {
  usageCountForItem,
  type ComponentUsageTally,
} from "./component-usage-scan";
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
  /** X6 — the FIFTH, INDEPENDENT axis: visibility in the Builder LAB itself
   *  (orthogonal to the four tenant surfaces + to target_context). Optional so
   *  older fixtures / the live DB during the migration window still typecheck;
   *  absence ⇒ Lab-visible (the table default, see {@link labEnabledForRow}). The
   *  DB supplies it after the 20261106000400 migration (DEFAULT true). */
  lab_enabled?: boolean;
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
  /** X6 — the independent Builder-Lab visibility toggle. A toggle from the Lab
   *  matrix's 5th column sets exactly this; orthogonal to the four tenant
   *  surfaces, so it never mirrors any legacy column. */
  lab_enabled?: boolean;
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

// ── Catalog admin-view + gallery policy (split out, surface-keys.ts pattern) ──
// `buildCatalogAdminView` / `CatalogAdminItem` (admin-view projection) and the
// §E policy/mapping leaves live in their own modules to keep this file under the
// 800-line cap. RE-EXPORTED here so existing `from "./registry-db-merge"` imports
// keep working. catalog-admin-view's back-reference to CatalogOverlayMap/Row is
// TYPE-ONLY (erased) → no runtime cycle.
export { buildCatalogAdminView } from "./catalog-admin-view";
export type { CatalogAdminItem } from "./catalog-admin-view";
export {
  dbGalleryTabToAddGalleryTab,
  dbTemplateGalleryItemId,
  templateTargetAllowed,
  templateTalentTierAllowed,
} from "./gallery-policy";
import type { CatalogAdminItem } from "./catalog-admin-view";
import {
  dbGalleryTabToAddGalleryTab,
  dbTemplateGalleryItemId,
  templateTargetAllowed,
  templateTalentTierAllowed,
} from "./gallery-policy";

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
  LAB_COLUMN,
  legacyToFourSurface,
  surfaceEnabledForRow,
  surfaceKeyToTarget,
  labEnabledForRow,
  type CatalogSurfaceKey,
} from "./surface-keys";
import {
  CATALOG_SURFACE_KEYS,
  CATALOG_SURFACE_LABEL,
  SURFACE_COLUMN,
  surfaceEnabledForRow,
  surfaceKeyToTarget,
  labEnabledForRow,
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
    // X6 — the INDEPENDENT Lab axis. Only the Lab merge subtracts on it; tenant
    // builders never carry `isLab`, so `lab_enabled` can never hide a component
    // from a tenant surface (and the four tenant toggles can never hide it from
    // the Lab — the two axes are fully orthogonal).
    if (ctx.isLab && !labEnabledForRow(ov)) continue;
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
  /**
   * X6 — when true, the merge runs for the BUILDER LAB surface, so the
   * independent `lab_enabled` overlay toggle subtracts (a `lab_enabled === false`
   * row is hidden from the Lab gallery). ORTHOGONAL to `surfaceKey`/`surfaceTarget`
   * (a tenant builder is never `isLab`, the Lab never carries a `surfaceKey`), so
   * hiding a component from the Lab never touches any tenant surface and vice
   * versa. Absent/false ⇒ the lab axis is not applied (tenant builders + the
   * null-surface homepage stay availability-only on this axis).
   */
  isLab?: boolean;
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
   * BATCHED preview resolution. Given the full published row set, return a
   * SYNCHRONOUS per-row lookup.
   *
   * `resolvePreviewImageUrl` above is awaited inside the per-row loop, so a real
   * implementation that queries storage would serialise one round-trip per
   * template on every gallery open. This variant lets the caller resolve every
   * asset in one query first. When both are supplied this one wins; when neither
   * is, cards fall back to the SVG wireframe exactly as before.
   */
  preparePreviewImageUrls?: (
    rows: ReadonlyArray<BuilderTemplateRow>,
  ) => Promise<(row: BuilderTemplateRow) => string | undefined>;
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

  // Batched resolver first (one query for the whole set); fall back to the
  // per-row dep, then to no preview at all.
  const batched = deps.preparePreviewImageUrls
    ? await deps
        .preparePreviewImageUrls(result.data)
        // A thumbnail failure must never blank the gallery — degrade to
        // wireframe cards, the same way a template-fetch failure degrades to
        // the code-only catalog above.
        .catch(() => () => undefined)
    : null;

  const dbItems: AddGalleryItem[] = [];
  for (const row of result.data) {
    const previewImageUrl = batched
      ? batched(row)
      : deps.resolvePreviewImageUrl
        ? await deps.resolvePreviewImageUrl(row)
        : undefined;
    dbItems.push(
      builderTemplateRowToGalleryItem(row, { previewImageUrl }),
    );
  }

  return finalize(mergeGalleryItems(dbItems, context));
}
