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

export async function listTenantMediaLibrary(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MediaLibraryItem[]> {
  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "id, tenant_id, owner_talent_profile_id, variant_kind, storage_path, bucket_id, width, height, file_size, created_at, metadata",
    )
    .eq("tenant_id", tenantId)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_ITEMS);

  if (error || !data) return [];

  return data.map((row) => {
    const bucket = (row as { bucket_id: string }).bucket_id;
    const storagePath = (row as { storage_path: string }).storage_path;
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return {
      id: (row as { id: string }).id,
      tenantId: (row as { tenant_id: string }).tenant_id,
      ownerTalentProfileId:
        (row as { owner_talent_profile_id: string | null }).owner_talent_profile_id,
      variantKind: (row as { variant_kind: string }).variant_kind,
      storagePath,
      publicUrl: urlData?.publicUrl ?? "",
      width: (row as { width: number | null }).width,
      height: (row as { height: number | null }).height,
      fileSize: (row as { file_size: number | null }).file_size,
      createdAt: (row as { created_at: string }).created_at,
      sourceHint: inferSourceHint((row as { metadata: unknown }).metadata),
    };
  });
}
