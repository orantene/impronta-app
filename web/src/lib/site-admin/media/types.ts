/**
 * MEDIA-1. The library discriminant surfaced by the shared media data layer.
 * Every builder surface's picker reads this off `MediaLibraryItem.assetKind` to
 * render an image thumbnail, a video preview, or a document icon. Legacy rows
 * (no `asset_kind` column / NULL) resolve to `"image"`.
 */
export type MediaAssetKind = "image" | "video" | "document";

export interface MediaLibraryItem {
  id: string;
  tenantId: string;
  ownerTalentProfileId: string | null;
  variantKind: string;
  /** MEDIA-1 discriminant — image (default) | video | document. */
  assetKind: MediaAssetKind;
  storagePath: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  mime: string | null;
  alt: string | null;
  /** MEDIA-1 free-text workspace tags (from media_assets.tags text[]). */
  tags: string[];
  createdAt: string;
  sourceHint: string | null;
  folderIds: string[];
}

export interface MediaLibraryFolder {
  id: string;
  name: string;
  color: string | null;
  assetIds: string[];
}

export interface BuilderImageMediaAsset {
  id: string;
  publicUrl: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface MediaAssetRow {
  id: string;
  tenant_id: string;
  owner_talent_profile_id: string | null;
  variant_kind: string;
  /** MEDIA-1 — may be absent on rows written before the migration applied. */
  asset_kind?: string | null;
  storage_path: string;
  bucket_id: string;
  public_url: string | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  file_size_bytes: number | null;
  byte_size: number | null;
  mime: string | null;
  mime_type: string | null;
  alt: string | null;
  /** MEDIA-1 — may be absent on rows written before the migration applied. */
  tags?: string[] | null;
  created_at: string;
  metadata: unknown;
}

export interface MediaFolderRow {
  id: string;
  name: string;
  color: string | null;
  media_folder_items?: Array<{ asset_id: string }>;
}
