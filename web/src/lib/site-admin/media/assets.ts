import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BuilderImageMediaAsset,
  MediaAssetRow,
  MediaFolderRow,
  MediaLibraryFolder,
  MediaLibraryItem,
} from "./types";
import {
  MEDIA_LIBRARY_MAX_ITEMS,
  MEDIA_PUBLIC_BUCKET,
  isSafeMediaUrl,
  normalizeAltText,
} from "./validation";

const MEDIA_ASSET_COLUMNS = [
  "id",
  "tenant_id",
  "owner_talent_profile_id",
  "variant_kind",
  "storage_path",
  "bucket_id",
  "public_url",
  "width",
  "height",
  "file_size",
  "file_size_bytes",
  "byte_size",
  "mime",
  "mime_type",
  "alt",
  "created_at",
  "metadata",
].join(", ");

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "heic",
  "heif",
]);

function inferSourceHint(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.source === "string") return m.source;
  if (typeof m.seeded_by === "string") return m.seeded_by;
  return null;
}

function resolvePublicUrl(
  supabase: SupabaseClient,
  row: Pick<MediaAssetRow, "bucket_id" | "storage_path" | "public_url">,
): string {
  if (isSafeMediaUrl(row.public_url)) return row.public_url;
  const { data } = supabase.storage
    .from(row.bucket_id)
    .getPublicUrl(row.storage_path);
  return isSafeMediaUrl(data?.publicUrl) ? data.publicUrl : "";
}

function isImageMediaRow(row: MediaAssetRow): boolean {
  const mime = row.mime ?? row.mime_type;
  if (mime?.startsWith("image/") && mime !== "image/svg+xml") return true;
  const ext = row.storage_path.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

function buildFolderIdMap(folders: ReadonlyArray<MediaLibraryFolder>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const folder of folders) {
    for (const assetId of folder.assetIds) {
      const existing = map.get(assetId) ?? [];
      existing.push(folder.id);
      map.set(assetId, existing);
    }
  }
  return map;
}

export function rowToMediaLibraryItem(
  supabase: SupabaseClient,
  row: MediaAssetRow,
  folderIds: string[] = [],
): MediaLibraryItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ownerTalentProfileId: row.owner_talent_profile_id,
    variantKind: row.variant_kind,
    storagePath: row.storage_path,
    publicUrl: resolvePublicUrl(supabase, row),
    width: row.width,
    height: row.height,
    fileSize: row.byte_size ?? row.file_size_bytes ?? row.file_size,
    mime: row.mime ?? row.mime_type,
    alt: normalizeAltText(row.alt),
    createdAt: row.created_at,
    sourceHint: inferSourceHint(row.metadata),
    folderIds,
  };
}

export function toBuilderImageMediaAsset(
  item: MediaLibraryItem,
): BuilderImageMediaAsset {
  return {
    id: item.id,
    publicUrl: item.publicUrl,
    alt: item.alt,
    width: item.width,
    height: item.height,
  };
}

export async function listTenantMediaLibrary(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MediaLibraryItem[]> {
  const [assetsResult, folders] = await Promise.all([
    supabase
      .from("media_assets")
      .select(MEDIA_ASSET_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MEDIA_LIBRARY_MAX_ITEMS),
    listTenantMediaFolders(supabase, tenantId),
  ]);

  if (assetsResult.error || !assetsResult.data) return [];

  const folderIdsByAsset = buildFolderIdMap(folders);
  return (assetsResult.data as unknown as MediaAssetRow[])
    .filter(isImageMediaRow)
    .map((row) =>
      rowToMediaLibraryItem(supabase, row, folderIdsByAsset.get(row.id) ?? []),
    )
    .filter((item) => isSafeMediaUrl(item.publicUrl));
}

export async function listTenantMediaFolders(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MediaLibraryFolder[]> {
  const { data, error } = await supabase
    .from("media_folders")
    .select("id, name, color, media_folder_items ( asset_id )")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as MediaFolderRow[]).map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    assetIds: (folder.media_folder_items ?? []).map((item) => item.asset_id),
  }));
}

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
  const row = data as unknown as MediaAssetRow;
  if (!isImageMediaRow(row)) return null;
  const folders = await listTenantMediaFolders(supabase, tenantId);
  const item = rowToMediaLibraryItem(
    supabase,
    row,
    buildFolderIdMap(folders).get(row.id) ?? [],
  );
  return isSafeMediaUrl(item.publicUrl) ? item : null;
}

export async function listBuilderImageMediaAssets(
  supabase: SupabaseClient,
  tenantId: string,
  assetIds: ReadonlyArray<string>,
): Promise<BuilderImageMediaAsset[]> {
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("media_assets")
    .select(MEDIA_ASSET_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .in("id", ids);

  if (error || !data) return [];
  return (data as unknown as MediaAssetRow[])
    .filter(isImageMediaRow)
    .map((row) => rowToMediaLibraryItem(supabase, row))
    .filter((item) => isSafeMediaUrl(item.publicUrl))
    .map(toBuilderImageMediaAsset);
}

export async function updateTenantMediaAssetAlt(input: {
  supabase: SupabaseClient;
  tenantId: string;
  assetId: string;
  alt: string | null;
}): Promise<MediaLibraryItem | null> {
  const { data, error } = await input.supabase
    .from("media_assets")
    .update({ alt: normalizeAltText(input.alt) })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.assetId)
    .is("deleted_at", null)
    .select(MEDIA_ASSET_COLUMNS)
    .maybeSingle();

  if (error || !data) return null;
  return rowToMediaLibraryItem(input.supabase, data as unknown as MediaAssetRow);
}

export async function insertTenantImageAsset(input: {
  supabase: SupabaseClient;
  tenantId: string;
  createdByUserId: string;
  storagePath: string;
  mime: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ item: MediaLibraryItem | null; error: string | null }> {
  const publicUrl = resolvePublicUrl(input.supabase, {
    bucket_id: MEDIA_PUBLIC_BUCKET,
    storage_path: input.storagePath,
    public_url: null,
  });
  if (!isSafeMediaUrl(publicUrl)) {
    return { item: null, error: "Storage returned an unsafe public URL." };
  }

  const { data, error } = await input.supabase
    .from("media_assets")
    .insert([
      {
        tenant_id: input.tenantId,
        uploaded_by_user_id: input.createdByUserId,
        created_by: input.createdByUserId,
        bucket_id: MEDIA_PUBLIC_BUCKET,
        storage_path: input.storagePath,
        public_url: publicUrl,
        variant_kind: "original",
        approval_state: "approved",
        purpose: "cms",
        sort_order: 0,
        width: input.width ?? null,
        height: input.height ?? null,
        file_size: input.byteSize,
        file_size_bytes: input.byteSize,
        byte_size: input.byteSize,
        mime: input.mime,
        mime_type: input.mime,
        alt: normalizeAltText(input.alt),
        metadata: input.metadata ?? {},
      },
    ])
    .select(MEDIA_ASSET_COLUMNS)
    .single();

  if (error || !data) {
    return {
      item: null,
      error: error?.message ?? "Could not record the uploaded asset.",
    };
  }

  return {
    item: rowToMediaLibraryItem(input.supabase, data as unknown as MediaAssetRow),
    error: null,
  };
}
