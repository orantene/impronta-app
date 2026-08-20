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
      .select("id, storage_path, bucket_id, width, height, alt_text, metadata")
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
      alt_text: string | null;
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
        altText: row.alt_text,
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
