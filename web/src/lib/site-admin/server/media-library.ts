/**
 * Tenant-scoped media library reads for admin surfaces.
 *
 * Scope for v1: lists approved media_assets rows (any variant_kind) for the
 * current tenant, newest first, bounded to 60 items. Returns public URLs
 * resolved through Supabase storage so admin pickers can render thumbnails
 * without a second round-trip.
 *
 * Uploads + deletion + bulk ops are follow-ups. This file stays read-only
 * so it can be imported from server components freely.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MediaLibraryItem {
  id: string;
  tenantId: string;
  ownerTalentProfileId: string | null;
  variantKind: string;
  storagePath: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  createdAt: string;
  sourceHint: string | null;
}

const MAX_ITEMS = 60;

function inferSourceHint(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.source === "string") return m.source;
  if (typeof m.seeded_by === "string") return m.seeded_by;
  return null;
}

const MEDIA_ASSET_COLUMNS =
  "id, tenant_id, owner_talent_profile_id, variant_kind, storage_path, bucket_id, width, height, file_size, created_at, metadata";

type MediaAssetRow = {
  id: string;
  tenant_id: string;
  owner_talent_profile_id: string | null;
  variant_kind: string;
  storage_path: string;
  bucket_id: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  created_at: string;
  metadata: unknown;
};

function rowToItem(supabase: SupabaseClient, row: MediaAssetRow): MediaLibraryItem {
  const { data: urlData } = supabase.storage
    .from(row.bucket_id)
    .getPublicUrl(row.storage_path);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ownerTalentProfileId: row.owner_talent_profile_id,
    variantKind: row.variant_kind,
    storagePath: row.storage_path,
    publicUrl: urlData?.publicUrl ?? "",
    width: row.width,
    height: row.height,
    fileSize: row.file_size,
    createdAt: row.created_at,
    sourceHint: inferSourceHint(row.metadata),
  };
}

export async function listTenantMediaLibrary(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MediaLibraryItem[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select(MEDIA_ASSET_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_ITEMS);

  if (error || !data) return [];

  return data.map((row) => rowToItem(supabase, row as unknown as MediaAssetRow));
}

/**
 * Single-asset lookup for callers that already know the id (e.g. resolving
 * a stored token like `shell.brand-logo-media-asset-id` to a publicUrl).
 * Server-side `.eq("id", ...)` avoids the 60-item over-fetch + client scan
 * that the old code did via `listTenantMediaLibrary`.
 */
export async function getTenantMediaAsset(
  supabase: SupabaseClient,
  tenantId: string,
  assetId: string,
): Promise<MediaLibraryItem | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select(MEDIA_ASSET_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", assetId)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return rowToItem(supabase, data as unknown as MediaAssetRow);
}
