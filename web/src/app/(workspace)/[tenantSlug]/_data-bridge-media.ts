import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge-media.ts — server-side loader for the workspace Media page.
 *
 * Returns media_assets rows (card + gallery + hero) owned by roster talents for
 * this tenant. Includes tags, folder membership, and file metadata for the v2
 * Media manager. RLS handles tenant isolation via talent_profile_id →
 * agency_talent_roster scoping.
 */

export type WorkspaceMediaPhoto = {
  id: string;
  talentProfileId: string;
  talentName: string;
  /** Public URL resolved from bucket + storage_path. */
  url: string;
  thumbUrl: string;
  variantKind: string;
  approvalState: "approved" | "pending" | "rejected";
  /** True when a per-image override exists (distinct from workspace-default WM). */
  hasOverride: boolean;
  watermarkOverride: unknown | null;
  tags: string[];
  /** IDs of folders this asset belongs to. */
  folderIds: string[];
  /** Pixel dimensions when available. */
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  originalFilename: string | null;
  /** Free-text note stored in metadata.note. */
  note: string | null;
  metadata: Record<string, unknown>;
  /** When this photo is a derivative (crop, baked watermark), the parent
   *  asset's id. Used to enable "Revert to original" in the lightbox. */
  sourceMediaAssetId: string | null;
  createdAt: string;
};

export type WorkspaceMediaFolder = {
  id: string;
  name: string;
  color: string | null;
  isPrivate: boolean;
  shareToken: string | null;
  shareExpiresAt: string | null;
  shareViewCount: number;
  assetIds: string[];
  createdAt: string;
};

type MediaRow = {
  id: string;
  owner_talent_profile_id: string;
  bucket_id: string;
  storage_path: string;
  variant_kind: string;
  approval_state: string;
  watermark_override_json: unknown | null;
  sort_order: number | null;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  original_filename: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  source_media_asset_id: string | null;
  created_at: string;
  talent_profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type FolderRow = {
  id: string;
  name: string;
  color: string | null;
  is_private: boolean;
  share_token: string | null;
  share_expires_at: string | null;
  share_view_count: number;
  created_at: string;
  media_folder_items: { asset_id: string }[];
};

export type WorkspaceMediaBridge = {
  photos: WorkspaceMediaPhoto[];
  folders: WorkspaceMediaFolder[];
  /** True if the underlying query failed. UI can distinguish "empty" from "broken". */
  errored: boolean;
  /** Total matching rows in the DB. May exceed `photos.length` when capped. */
  totalCount: number | null;
};

export async function loadWorkspaceMediaPhotos(
  tenantId: string,
): Promise<WorkspaceMediaPhoto[]> {
  const bridge = await loadWorkspaceMediaBridge(tenantId);
  return bridge.photos;
}

export async function loadWorkspaceMediaBridge(
  tenantId: string,
): Promise<WorkspaceMediaBridge> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { photos: [], folders: [], errored: true, totalCount: null };

    // Load photos, a true filtered count, and folders in parallel.
    //
    // The count is a separate `head: true` query because Supabase's
    // `select(..., { count: "exact" })` on a query with an `!inner` join
    // returns the *unfiltered* root-table count, not the post-join count.
    // The dedicated count query reproduces the exact filter set so the
    // page can show "Showing N of M" reliably.
    const [photosResult, totalCountResult, foldersResult] = await Promise.all([
      supabase
        .from("media_assets")
        .select(`
          id,
          owner_talent_profile_id,
          bucket_id,
          storage_path,
          variant_kind,
          approval_state,
          watermark_override_json,
          sort_order,
          width,
          height,
          file_size_bytes,
          mime_type,
          original_filename,
          tags,
          metadata,
          source_media_asset_id,
          created_at,
          talent_profiles!owner_talent_profile_id (
            id,
            display_name,
            first_name,
            last_name,
            agency_talent_roster!inner (
              tenant_id,
              status
            )
          )
        `)
        .in("variant_kind", ["card", "gallery", "hero"])
        .is("deleted_at", null)
        .eq("talent_profiles.agency_talent_roster.tenant_id", tenantId)
        // Exclude photos owned by talent who've been removed from the roster.
        // Without this, ex-roster talents' media still pads the workspace
        // gallery, inflating counts and exposing rows the page shouldn't show.
        .neq("talent_profiles.agency_talent_roster.status", "removed")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .limit(5000),

      supabase
        .from("media_assets")
        .select(
          "id, talent_profiles!owner_talent_profile_id!inner(agency_talent_roster!inner(tenant_id, status))",
          { count: "exact", head: true },
        )
        .in("variant_kind", ["card", "gallery", "hero"])
        .is("deleted_at", null)
        .eq("talent_profiles.agency_talent_roster.tenant_id", tenantId)
        .neq("talent_profiles.agency_talent_roster.status", "removed"),

      supabase
        .from("media_folders")
        .select(`
          id,
          name,
          color,
          is_private,
          share_token,
          share_expires_at,
          share_view_count,
          created_at,
          media_folder_items ( asset_id )
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
    ]);

    if (photosResult.error) {
      logServerError("data-bridge.media.list", photosResult.error);
      return { photos: [], folders: [], errored: true, totalCount: null };
    }

    const rows = (photosResult.data ?? []) as unknown as MediaRow[];
    const folderRows = (foldersResult.data ?? []) as unknown as FolderRow[];
    const totalCount = typeof totalCountResult.count === "number" ? totalCountResult.count : null;

    // Build a map of assetId → folderIds for O(1) lookup
    const assetFolderMap = new Map<string, string[]>();
    for (const folder of folderRows) {
      for (const item of folder.media_folder_items) {
        const list = assetFolderMap.get(item.asset_id) ?? [];
        list.push(folder.id);
        assetFolderMap.set(item.asset_id, list);
      }
    }

    const photos: WorkspaceMediaPhoto[] = rows
      .filter((r) => !!r.talent_profiles)
      .map((r) => {
        const tp = r.talent_profiles!;
        const display =
          tp.display_name ||
          [tp.first_name, tp.last_name].filter(Boolean).join(" ") ||
          "Unnamed";

        const { data: urlData } = supabase.storage
          .from(r.bucket_id)
          .getPublicUrl(r.storage_path);
        const publicUrl = urlData?.publicUrl ?? "";
        const meta = r.metadata ?? {};

        return {
          id: r.id,
          talentProfileId: r.owner_talent_profile_id,
          talentName: display,
          url: publicUrl,
          thumbUrl: publicUrl,
          variantKind: r.variant_kind,
          approvalState: r.approval_state as WorkspaceMediaPhoto["approvalState"],
          hasOverride: r.watermark_override_json !== null,
          watermarkOverride: r.watermark_override_json,
          tags: Array.isArray(r.tags) ? r.tags : [],
          folderIds: assetFolderMap.get(r.id) ?? [],
          width: r.width,
          height: r.height,
          fileSizeBytes: r.file_size_bytes,
          mimeType: r.mime_type,
          originalFilename: r.original_filename,
          note: (meta.note as string | null) ?? null,
          metadata: meta,
          sourceMediaAssetId: r.source_media_asset_id,
          createdAt: r.created_at,
        };
      });

    const folders: WorkspaceMediaFolder[] = folderRows.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      isPrivate: f.is_private,
      shareToken: f.share_token,
      shareExpiresAt: f.share_expires_at,
      shareViewCount: f.share_view_count,
      assetIds: f.media_folder_items.map((i) => i.asset_id),
      createdAt: f.created_at,
    }));

    return { photos, folders, errored: false, totalCount };
  } catch (err) {
    logServerError("data-bridge.media.unknown", err);
    return { photos: [], folders: [], errored: true, totalCount: null };
  }
}
