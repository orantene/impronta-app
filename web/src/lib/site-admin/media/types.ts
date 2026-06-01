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
  mime: string | null;
  alt: string | null;
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
  created_at: string;
  metadata: unknown;
}

export interface MediaFolderRow {
  id: string;
  name: string;
  color: string | null;
  media_folder_items?: Array<{ asset_id: string }>;
}
