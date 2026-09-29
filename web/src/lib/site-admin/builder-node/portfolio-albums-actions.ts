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
import type { MediaAlbumEntry } from "@/lib/server-actions/admin-talent-profile-sections";

export type TalentMediaAlbumOption = {
  id: string;
  name: string;
  sortOrder: number;
};

type LoadResult =
  | { ok: true; albums: TalentMediaAlbumOption[] }
  | { ok: false; error: string };

async function canEditTalent(talentProfileId: string): Promise<boolean> {
  const session = await getCachedActorSession();
  if (!session.user) return false;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const { data: tp, error: tpErr } = await supabase
    .from("talent_profiles")
    .select("id, user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (tpErr) {
    logServerError("portfolioAlbums.canEdit.talent", tpErr);
    return false;
  }
  if (!tp) return false;
  if (tp.user_id === session.user.id) return true;

  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return false;
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data: roster, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", staff.tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (rosterErr) {
    logServerError("portfolioAlbums.canEdit.roster", rosterErr);
    return false;
  }
  return Boolean(roster);
}

function normalizeAlbums(raw: unknown): TalentMediaAlbumOption[] {
  if (!Array.isArray(raw)) return [];
  const out: TalentMediaAlbumOption[] = [];
  for (const [i, row] of raw.entries()) {
    if (!row || typeof row !== "object") continue;
    const r = row as MediaAlbumEntry;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!id || !name) continue;
    out.push({
      id,
      name,
      sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : i,
    });
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
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
    return { ok: true, albums: normalizeAlbums(blobs.media_albums_data) };
  } catch (err) {
    logServerError("portfolio.loadAlbums", err);
    return { ok: false, error: "Could not load albums." };
  }
}
