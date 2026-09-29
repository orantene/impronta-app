"use server";

/**
 * Editor load of talent media albums for the W-12 portfolio chapter picker.
 * Albums live in System-B blob `albums.list` (`media_albums_data`). Photos
 * reference them via `media_assets.metadata.albumId`.
 */
import { getCachedActorSession } from "@/lib/server/request-cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import {
  normalizeTalentMediaAlbums,
  type TalentMediaAlbumOption,
} from "./portfolio-albums";

type LoadResult =
  | { ok: true; albums: TalentMediaAlbumOption[] }
  | { ok: false; error: string };

async function canEditTalent(talentProfileId: string): Promise<boolean> {
  const session = await getCachedActorSession();
  if (!session.user) return false;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const { data: tp } = await supabase
    .from("talent_profiles")
    .select("id, user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (!tp) return false;
  if (tp.user_id === session.user.id) return true;

  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return false;
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data: roster } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", staff.tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  return Boolean(roster);
}

/** Editor: albums for the chapter collection picker. Never invents albums. */
export async function loadTalentMediaAlbumsForEditor(
  talentProfileId: string,
): Promise<LoadResult> {
  try {
    if (!talentProfileId.trim()) {
      return { ok: false, error: "Missing talent profile." };
    }
    if (!(await canEditTalent(talentProfileId))) {
      return { ok: false, error: "Not authorized." };
    }
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const blobs = await readBlobFieldValuesFromCatalog(admin, talentProfileId);
    return { ok: true, albums: normalizeTalentMediaAlbums(blobs.media_albums_data) };
  } catch (err) {
    logServerError("portfolio.loadAlbums", err);
    return { ok: false, error: "Could not load albums." };
  }
}
