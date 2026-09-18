/**
 * platform-stock.ts — the shared image library every tenant can draw from.
 *
 * A new workspace starts with an empty Media page, so its first site is built
 * out of whatever the operator happens to have on a phone. The platform can do
 * better: keep a curated stock collection centrally and let every tenant use it
 * without owning or duplicating it.
 *
 * WHERE IT LIVES, and why not the obvious place. `PLATFORM_TENANT_ID` in
 * integrations/platform-defaults.ts is `…0001`, which is IMPRONTA's tenant id —
 * the first tenant became the de-facto platform row. Reusing it here would mean
 * "the shared stock library" and "Impronta's private media" were literally the
 * same rows, and every other tenant reading stock would be reading Impronta's
 * photographs. Stock therefore lives under the `tulala` tenant, and even there
 * only what is deliberately filed into the Stock folder is shared: putting an
 * image in that tenant is not enough, someone has to file it.
 *
 * READ-ONLY BY CONSTRUCTION. There is no write path here. A tenant browsing
 * stock gets rows it can reference by URL; it cannot rename, delete, or re-file
 * them, because the only exported function is a SELECT. Stock is curated by the
 * platform through `scripts/import-stock-images.ts`.
 *
 * NOT AN RLS CHANGE. The read runs on the caller's existing client. Nothing
 * about tenant isolation moves: this is one extra, explicit, opt-in query for a
 * different tenant's clearly-marked shared folder, never an OR bolted onto the
 * tenant library query. The isolation incidents in this repo all came from
 * widening a shared query; this adds a separate lane instead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import type { SystemFolderSpec } from "./system-folders";

/** The tenant that owns platform stock. Resolved by slug, never hardcoded as
 *  an id, so a fresh environment cannot silently point stock at tenant #1. */
export const PLATFORM_STOCK_TENANT_SLUG = "tulala";

/** Only what is filed HERE is shared. See the module doc. */
export const STOCK_FOLDER: SystemFolderSpec = {
  systemKey: "stock",
  name: "Tulala Stock",
  color: "#2F6F8F",
};

export interface StockImage {
  id: string;
  storagePath: string;
  bucketId: string;
  width: number | null;
  height: number | null;
  altText: string | null;
  /** Free-text grouping the importer sets, e.g. "editorial", "event". */
  category: string | null;
}

/** The platform-stock tenant's id, or null when the tenant does not exist. */
export async function resolveStockTenantId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", PLATFORM_STOCK_TENANT_SLUG)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Every image in the shared library.
 *
 * Returns [] rather than throwing when stock is not set up: a tenant whose
 * platform has no stock yet must see an empty shelf, not a broken Media page.
 */
export async function queryPlatformStock(
  supabase: SupabaseClient,
  options: { limit?: number; category?: string | null } = {},
): Promise<StockImage[]> {
  try {
    const tenantId = await resolveStockTenantId(supabase);
    if (!tenantId) return [];

    const { data: folder } = await supabase
      .from("media_folders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("system_key", STOCK_FOLDER.systemKey)
      .maybeSingle();
    const folderId = (folder as { id: string } | null)?.id;
    if (!folderId) return [];

    const { data: items } = await supabase
      .from("media_folder_items")
      .select("asset_id")
      .eq("folder_id", folderId);
    const assetIds = (items ?? []).map((row) => (row as { asset_id: string }).asset_id);
    if (assetIds.length === 0) return [];

    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, storage_path, bucket_id, width, height, alt, metadata")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("id", assetIds)
      .limit(Math.max(1, Math.min(options.limit ?? 200, 500)));

    const rows = (assets ?? []) as Array<{
      id: string;
      storage_path: string | null;
      bucket_id: string | null;
      width: number | null;
      height: number | null;
      alt: string | null;
      metadata: Record<string, unknown> | null;
    }>;

    return rows
      .filter((row) => !!row.storage_path)
      .map((row) => ({
        id: row.id,
        storagePath: row.storage_path as string,
        bucketId: row.bucket_id ?? "media-public",
        width: row.width,
        height: row.height,
        altText: row.alt,
        category:
          typeof row.metadata?.["stock_category"] === "string"
            ? (row.metadata["stock_category"] as string)
            : null,
      }))
      .filter((row) => !options.category || row.category === options.category);
  } catch (error) {
    // An unreachable shared library must never take a tenant's Media page down.
    logServerError("media.platform-stock.query", error);
    return [];
  }
}

// ── Lifestyle stock by business type × role (Templates & Imagery, Layer 3) ──
//
// The manifest lives in `platform_stock_images` (migration 20260916000356);
// the bytes stay on `media_assets` rows under the stock tenant, exactly as
// the flat shelf above. A tenant's "Lifestyle stock" folder is VIRTUAL: it is
// this read, filtered to the tenant's business type with the family pack as
// the fallback, so a photo platform admin adds is visible everywhere at once
// and never counts against a tenant's cap (D-TPL-6). Retired rows are hidden
// here but their objects stay, so a page that placed one keeps rendering.

export type StockRole = "hero" | "wide" | "portrait" | "gallery" | "team" | "detail";

export interface LifestyleStockPhoto {
  /** `platform_stock_images.id` */
  id: string;
  assetId: string;
  url: string;
  width: number | null;
  height: number | null;
  role: StockRole;
  /** `business-types.ts` id, or null for the family pack. */
  businessType: string | null;
  family: string;
  alt: { es: string; en: string };
  source: "generated" | "licensed";
  licence: string;
  createdAt: string;
  /** Set when soft-retired (only returned with `includeRetired`). */
  retiredAt: string | null;
  /** Review state (03 §4). Serving reads only return approved / qa_passed. */
  approval: StockApproval;
  /** Where the bytes came from; `unverified` rows are never counted as photos placed. */
  provenance: StockProvenance;
  /** Visual direction inside the type, when the engine generated it. */
  direction: string | null;
  /** Stated brief facts the prompt was filled from ({} for seed assets). */
  tags: Record<string, string>;
  /** The business a tenant-generated asset was made for (null for pool assets). */
  originTenantId: string | null;
  timesPlaced: number;
}

export type StockApproval = "generated" | "qa_passed" | "approved" | "rejected" | "retired";
export type StockProvenance = "generated" | "licensed" | "unverified";

type ManifestRow = {
  id: string;
  asset_id: string;
  business_type: string | null;
  family: string;
  role: StockRole;
  source: "generated" | "licensed";
  licence: string;
  alt_es: string;
  alt_en: string;
  sort_order: number;
  created_at: string;
  retired_at: string | null;
  approval: StockApproval;
  provenance: StockProvenance;
  direction: string | null;
  tags: Record<string, string> | null;
  origin_tenant_id: string | null;
  times_placed: number | null;
};

const MANIFEST_SELECT =
  "id, asset_id, business_type, family, role, source, licence, alt_es, alt_en, sort_order, created_at, retired_at, approval, provenance, direction, tags, origin_tenant_id, times_placed";

/** Roles a merely QA-passed asset may serve (03 §4: soft launch for the small frames). */
const QA_PASSED_SERVES: ReadonlySet<StockRole> = new Set(["gallery", "detail"]);

function servesRole(r: Pick<ManifestRow, "approval" | "role">): boolean {
  return r.approval === "approved" || (r.approval === "qa_passed" && QA_PASSED_SERVES.has(r.role));
}

/** The family whose pack is every other family's last resort. */
export const UNIVERSAL_STOCK_FAMILY = "custom";

/**
 * Live stock for one business type: the type's own rows first, then the
 * family pack, then the universal pack (`custom`). Only approved rows serve
 * (qa_passed for gallery/detail); a tenant's own generated rows serve that
 * tenant from any state past automated QA when `forTenantId` is given.
 * Returns [] (never throws) when the manifest is empty or the stock tenant is
 * missing, so a Media page stays up with an empty shelf.
 */
export async function queryLifestyleStockForType(
  supabase: SupabaseClient,
  input: { businessType: string | null; family: string; includeRetired?: boolean; forTenantId?: string | null },
): Promise<LifestyleStockPhoto[]> {
  try {
    const tenantId = await resolveStockTenantId(supabase);
    if (!tenantId) return [];

    const families = input.family === UNIVERSAL_STOCK_FAMILY ? [input.family] : [input.family, UNIVERSAL_STOCK_FAMILY];
    let q = supabase
      .from("platform_stock_images")
      .select(MANIFEST_SELECT)
      .in("family", families)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(400);
    if (!input.includeRetired) q = q.is("retired_at", null);
    const { data: manifest, error } = await q;
    if (error) {
      logServerError("media.platform-stock.manifest", error);
      return [];
    }
    const rows = ((manifest ?? []) as ManifestRow[]).filter(
      (r) =>
        // A tenant's own images were generated for ONE type; they never carry
        // over when the business is re-composed as another type.
        (r.business_type === null || r.business_type === input.businessType) &&
        (r.origin_tenant_id === null || r.origin_tenant_id !== input.forTenantId || r.business_type === input.businessType) &&
        // Another tenant's generated image serves the pool only once approved;
        // the originating tenant sees its own from qa_passed on.
        (r.origin_tenant_id === null || r.origin_tenant_id === input.forTenantId || r.approval === "approved") &&
        (input.includeRetired ||
          servesRole(r) ||
          (r.origin_tenant_id !== null && r.origin_tenant_id === input.forTenantId && r.approval === "qa_passed")),
    );
    if (rows.length === 0) return [];

    // The tenant's own images outrank type rows, which outrank the family
    // pack, which outranks the universal pack.
    const rank = (r: ManifestRow) =>
      r.origin_tenant_id !== null && r.origin_tenant_id === input.forTenantId ? -1 : r.business_type !== null ? 0 : r.family === input.family ? 1 : 2;
    const ranked = [...rows].sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order);
    const out = await hydrate(supabase, tenantId, ranked);
    return out;
  } catch (error) {
    logServerError("media.platform-stock.by-type", error);
    return [];
  }
}

/** Join manifest rows to their media_assets and build public URLs; rows without an object are dropped. */
async function hydrate(supabase: SupabaseClient, tenantId: string, rows: ManifestRow[]): Promise<LifestyleStockPhoto[]> {
  if (rows.length === 0) return [];
  const { data: assets, error: assetsError } = await supabase
    .from("media_assets")
    .select("id, storage_path, bucket_id, width, height")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("id", rows.map((r) => r.asset_id));
  if (assetsError) {
    logServerError("media.platform-stock.assets", assetsError);
    return [];
  }
  const byId = new Map(
    ((assets ?? []) as Array<{ id: string; storage_path: string | null; bucket_id: string | null; width: number | null; height: number | null }>).map((a) => [a.id, a] as const),
  );
  const out: LifestyleStockPhoto[] = [];
  for (const r of rows) {
    const a = byId.get(r.asset_id);
    if (!a?.storage_path) continue;
    const bucket = a.bucket_id ?? "media-public";
    out.push({
      id: r.id,
      assetId: r.asset_id,
      url: supabase.storage.from(bucket).getPublicUrl(a.storage_path).data.publicUrl,
      width: a.width,
      height: a.height,
      role: r.role,
      businessType: r.business_type,
      family: r.family,
      alt: { es: r.alt_es, en: r.alt_en },
      source: r.source,
      licence: r.licence,
      createdAt: r.created_at,
      retiredAt: r.retired_at,
      approval: r.approval,
      provenance: r.provenance,
      direction: r.direction,
      tags: r.tags ?? {},
      originTenantId: r.origin_tenant_id,
      timesPlaced: r.times_placed ?? 0,
    });
  }
  return out;
}

/** The human queue (03 §4.3): not yet approved/rejected, heroes first, oldest first. */
export async function queryStockReviewQueue(supabase: SupabaseClient, options: { limit?: number } = {}): Promise<LifestyleStockPhoto[]> {
  try {
    const tenantId = await resolveStockTenantId(supabase);
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("platform_stock_images")
      .select(MANIFEST_SELECT)
      .in("approval", ["generated", "qa_passed"])
      .is("retired_at", null)
      .order("generated_at", { ascending: true })
      .limit(Math.min(options.limit ?? 120, 400));
    if (error) {
      logServerError("media.platform-stock.review-queue", error);
      return [];
    }
    const rows = (data ?? []) as ManifestRow[];
    rows.sort((a, b) => (a.role === "hero" ? 0 : 1) - (b.role === "hero" ? 0 : 1));
    return hydrate(supabase, tenantId, rows);
  } catch (error) {
    logServerError("media.platform-stock.review-queue", error);
    return [];
  }
}

export interface StockCoverageCell {
  family: string;
  businessType: string | null;
  role: StockRole;
  /** Serving rows (approved, or qa_passed on gallery/detail), not retired. */
  live: number;
  approved: number;
  qaPassed: number;
  /** Awaiting automated QA or human review. */
  pending: number;
  retired: number;
}

/** Coverage per (type|family) × role, for the platform admin section. Pool rows only (tenant-origin rows count once approved). */
export async function queryLifestyleStockCoverage(supabase: SupabaseClient): Promise<StockCoverageCell[]> {
  const { data, error } = await supabase
    .from("platform_stock_images")
    .select("family, business_type, role, retired_at, approval, origin_tenant_id")
    .limit(5000);
  if (error) {
    logServerError("media.platform-stock.coverage", error);
    return [];
  }
  const map = new Map<string, StockCoverageCell>();
  for (const r of (data ?? []) as Array<{ family: string; business_type: string | null; role: StockRole; retired_at: string | null; approval: StockApproval; origin_tenant_id: string | null }>) {
    if (r.origin_tenant_id !== null && r.approval !== "approved") continue;
    const key = `${r.family}|${r.business_type ?? ""}|${r.role}`;
    const cur = map.get(key) ?? { family: r.family, businessType: r.business_type, role: r.role, live: 0, approved: 0, qaPassed: 0, pending: 0, retired: 0 };
    if (r.retired_at) cur.retired += 1;
    else {
      if (servesRole(r)) cur.live += 1;
      if (r.approval === "approved") cur.approved += 1;
      else if (r.approval === "qa_passed") cur.qaPassed += 1;
      else if (r.approval === "generated") cur.pending += 1;
    }
    map.set(key, cur);
  }
  return [...map.values()];
}
