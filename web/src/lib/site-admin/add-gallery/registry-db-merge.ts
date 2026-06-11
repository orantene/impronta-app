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

import { ADD_GALLERY_ITEMS } from "./registry";
import type { AddGalleryItem, AddGalleryTab } from "./types";

// ── Plan rank (mirrors registry-rows.templatePlanAllowed / data-bindings PLAN_RANK) ──

type PlanKey = "free" | "studio" | "agency" | "network";

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
  /** Surface plan for required_plan gating (§E). */
  plan?: PlanKey | null;
  /** Surface talent tier for required_talent_tier gating (§E). */
  talentTier?: string | null;
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
  if (!context.galleryPolicy.allowDbTemplates) {
    // DB templates suppressed → code-only, no DB round-trip.
    return codeGalleryItemsForPolicy(context.galleryPolicy);
  }

  const result = await deps.listPublishedTemplates({
    targetContext: context.surfaceTarget ?? null,
    plan: context.plan ?? null,
  });

  if (!result.ok) {
    // Never fail the gallery on a template-fetch error — fall back to code-only.
    return codeGalleryItemsForPolicy(context.galleryPolicy);
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

  return mergeGalleryItems(dbItems, context);
}
