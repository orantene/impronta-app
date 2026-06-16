import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type {
  TalentPortfolioStarterProfile,
  TalentPortfolioStarterMedia,
} from "@/lib/talent-site/starter";
import { loadTalentStarterProfileData } from "./load-starter-data";

export interface DefaultTalentFreeformContext {
  profile: TalentPortfolioStarterProfile;
  media: TalentPortfolioStarterMedia[];
  /** Managing agency tenant (`talent_profiles.created_by_agency_id`) or null. */
  tenantId: string | null;
}

/**
 * Load everything the platform-default FREEFORM profile needs for a talent: the
 * public-safe starter profile, approved public media (for the gallery), and the
 * managing agency tenant id (scopes any curated `section_embed` data fetch).
 *
 * Service-role reads (the public anon client can't see another talent's
 * managing tenant); returns `null` on any failure so the resolver degrades to
 * the untouched `LightProfileLayout` fallback rather than throwing.
 */
export async function loadDefaultTalentFreeformContext(
  talentProfileId: string,
): Promise<DefaultTalentFreeformContext | null> {
  const profile = await loadTalentStarterProfileData(talentProfileId);
  if (!profile) return null;

  const admin = createServiceRoleClient();
  if (!admin) {
    // No service role → render with no media + no tenant (build-time-hydrated
    // text still renders; gallery/embeds degrade gracefully).
    return { profile, media: [], tenantId: null };
  }

  let media: TalentPortfolioStarterMedia[] = [];
  let tenantId: string | null = null;

  try {
    const { data: mediaRows } = await admin
      .from("media_assets")
      .select("storage_path")
      .eq("owner_talent_profile_id", talentProfileId)
      // Real media_variant_kind values only — `portfolio` is not an enum member.
      .in("variant_kind", ["public_watermarked", "gallery", "hero"])
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(12);

    const BUCKET = "media-public";
    media = (mediaRows ?? []).map((row) => {
      const r = row as { storage_path: string };
      return {
        url: admin.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
        alt: profile.displayName,
      };
    });

    const { data: profileRow } = await admin
      .from("talent_profiles")
      .select("created_by_agency_id")
      .eq("id", talentProfileId)
      .maybeSingle();
    tenantId =
      (profileRow as { created_by_agency_id?: string | null } | null)
        ?.created_by_agency_id ?? null;
  } catch (err) {
    logServerError("talentSite.defaultFreeform.loadContext", err);
  }

  return { profile, media, tenantId };
}
