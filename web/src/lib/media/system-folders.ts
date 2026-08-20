/**
 * system-folders.ts — the folders the app creates for a tenant by itself.
 *
 * `media_folders.system_key` is the machine name for a folder the product owns
 * rather than the operator: `branding` for brand assets, `lifestyle` for the
 * agency's lifestyle and campaign imagery. They are created LAZILY, on first
 * use, so a tenant that never uploads a logo never grows an empty Branding
 * folder.
 *
 * This module exists because the get-or-create is subtle enough that having
 * two copies of it would be two chances to get it wrong. The subtlety is the
 * RACE: `media_folders_tenant_system_key_uniq` means two concurrent first-uses
 * both try to insert and one loses. The loser must re-select rather than fail,
 * or an upload errors for no reason the operator could understand.
 *
 * NOTE ON TYPES: `database.types.ts` predates the `system_key` migration and
 * has not been regenerated, so the column is invisible to the generated types.
 * The casts below are that gap, not sloppiness — the same shape the existing
 * callers use (`folder-actions.ts`, `brand-library.ts`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export interface SystemFolderSpec {
  /** Stable machine key — the unique index is on (tenant_id, system_key). */
  systemKey: string;
  /** What the operator sees in the media library sidebar. */
  name: string;
  /** Sidebar dot. Distinct per folder so the two are tellable apart at a glance. */
  color: string;
}

export const BRANDING_FOLDER: SystemFolderSpec = {
  systemKey: "branding",
  name: "Branding",
  color: "#0F4F3E",
};

/**
 * Lifestyle: the home for the agency's own imagery — AI-generated lifestyle
 * frames file themselves here on creation, and an operator can drop any
 * non-talent upload (venue, location, campaign stills) into it from the media
 * library's folder list. Deliberately NOT "AI Lifestyle": the owner's decision
 * was that this is a home for lifestyle imagery whatever made it.
 */
export const LIFESTYLE_FOLDER: SystemFolderSpec = {
  systemKey: "lifestyle",
  name: "Lifestyle",
  color: "#8A5A2B",
};

/**
 * Get-or-create the tenant's copy of a system folder. Returns the folder id,
 * or null when even the post-race re-select found nothing — callers treat null
 * as "file it nowhere" and carry on, because failing to sort an asset must
 * never fail the upload that produced it.
 */
export async function ensureSystemFolder(
  admin: SupabaseClient,
  tenantId: string,
  spec: SystemFolderSpec,
  createdBy: string | null,
): Promise<string | null> {
  const existing = await admin
    .from("media_folders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("system_key", spec.systemKey)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id as string;

  const { data: created, error } = await admin
    .from("media_folders")
    .insert({
      tenant_id: tenantId,
      name: spec.name,
      system_key: spec.systemKey,
      color: spec.color,
      created_by: createdBy,
    } as never)
    .select("id")
    .single();
  if (created?.id) return created.id as string;

  if (error) {
    // Lost the insert race — the winner's row is there now.
    const again = await admin
      .from("media_folders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("system_key", spec.systemKey)
      .maybeSingle();
    if (again.data?.id) return again.data.id as string;
    logServerError("media.system-folder.ensure", error);
  }
  return null;
}

/**
 * File an asset into a system folder, creating the folder if needed.
 *
 * Upsert on the folder/asset pair: re-filing an asset that is already there is
 * a no-op rather than a unique-violation, which matters because generation and
 * backfill can both reach the same asset.
 */
export async function fileAssetInSystemFolder(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    assetId: string;
    spec: SystemFolderSpec;
    addedBy: string | null;
  },
): Promise<string | null> {
  const folderId = await ensureSystemFolder(admin, input.tenantId, input.spec, input.addedBy);
  if (!folderId) return null;

  const { error } = await admin
    .from("media_folder_items")
    .upsert(
      { folder_id: folderId, asset_id: input.assetId, added_by: input.addedBy },
      { onConflict: "folder_id,asset_id" },
    );
  if (error) {
    // Sorting is a convenience; the asset itself is already saved and usable.
    logServerError("media.system-folder.file", error);
    return null;
  }
  return folderId;
}
