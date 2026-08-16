/**
 * library-query-sidecars.ts — the four small reads that surround the media
 * library's keyset page query.
 *
 * They were extracted from `library-query.ts` (2026-08-16) when the per-talent
 * filter pushed that file past the repo's 800-line cap. Nothing about them
 * changed in the move: each is one scoped SELECT answering a question the page
 * query cannot answer for itself — which folders exist, which talents the
 * filter may offer, whose media has left with them, and what is linked to a
 * talent's profile.
 *
 * They live together because they share one non-negotiable property: EVERY one
 * of them filters `tenant_id`. The talent lane calls the query layer with a
 * SERVICE-ROLE client, so the app layer is the only tenant gate there is, and
 * `[library-scope] EVERY query is tenant-scoped` in `library-query.test.ts`
 * asserts precisely that over the recorded call list.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MediaLibraryTalentOption,
  WorkspaceMediaFolder,
} from "./library-item";

export async function loadFolders(
  supabase: SupabaseClient,
  tenantId: string,
  includePrivate: boolean,
): Promise<WorkspaceMediaFolder[]> {
  const { data, error } = await supabase
    .from("media_folders")
    .select(
      "id, name, color, is_private, share_token, share_expires_at, share_view_count, created_at, is_collection, shoot_date, media_folder_items ( asset_id )",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  type FolderRow = {
    id: string;
    name: string;
    color: string | null;
    is_private: boolean | null;
    share_token: string | null;
    share_expires_at: string | null;
    share_view_count: number | null;
    created_at: string;
    is_collection: boolean | null;
    shoot_date: string | null;
    media_folder_items: Array<{ asset_id: string }> | null;
  };

  return (data as unknown as FolderRow[])
    .filter((folder) => includePrivate || folder.is_private !== true)
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      isPrivate: folder.is_private === true,
      shareToken: folder.share_token,
      shareExpiresAt: folder.share_expires_at,
      shareViewCount: folder.share_view_count ?? 0,
      assetIds: (folder.media_folder_items ?? []).map((item) => item.asset_id),
      createdAt: folder.created_at,
      isCollection: folder.is_collection === true,
      shootDate: folder.shoot_date,
    }));
}

/**
 * The roster the "filter by talent" select may offer. Non-removed statuses
 * only, because a removed talent's media is already excluded from every read
 * in the library — an option that can only ever return zero assets is a trap,
 * not a filter.
 */
export async function loadTalentOptions(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MediaLibraryTalentOption[]> {
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select(
      "talent_profile_id, talent_profiles!talent_profile_id ( id, display_name, first_name, last_name, profile_code )",
    )
    .eq("tenant_id", tenantId)
    .neq("status", "removed");
  if (error || !data) return [];

  type RosterRow = {
    talent_profile_id: string | null;
    talent_profiles?: {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      profile_code: string | null;
    } | null;
  };

  const byId = new Map<string, MediaLibraryTalentOption>();
  for (const row of data as unknown as RosterRow[]) {
    const id = row.talent_profile_id;
    if (!id) continue;
    const profile = row.talent_profiles ?? null;
    const name =
      profile?.display_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      "Unnamed";
    // A talent can hold more than one roster row for the same tenant (a rejoin
    // is additive in places); the select must not show them twice.
    if (!byId.has(id)) {
      byId.set(id, { id, name, profileCode: profile?.profile_code ?? null });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Talents this workspace removed from its roster. Their media leaves with them. */
export async function loadExcludedTalentIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "removed");
  if (error || !data) return [];
  return (data as Array<{ talent_profile_id: string | null }>)
    .map((row) => row.talent_profile_id)
    .filter((id): id is string => !!id);
}

/**
 * The asset ids linked to this talent's public profile, scoped to the managing
 * tenant. A talent can sit on several rosters, so the tenant filter is the
 * security boundary, not a nicety (the caller passes a service-role client).
 */
export async function loadPortfolioAssetIds(
  supabase: SupabaseClient,
  talentProfileId: string,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("agency_talent_media")
    .select("agency_media_id, master_media_id, display_order")
    .eq("talent_profile_id", talentProfileId)
    .eq("tenant_id", tenantId)
    .order("display_order", { ascending: true });
  if (error || !data) return [];
  const ids: string[] = [];
  for (const link of data as Array<{
    agency_media_id: string | null;
    master_media_id: string | null;
  }>) {
    if (link.agency_media_id) ids.push(link.agency_media_id);
    if (link.master_media_id) ids.push(link.master_media_id);
  }
  return [...new Set(ids)];
}
