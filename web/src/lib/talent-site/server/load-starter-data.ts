import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { canonicalBioEn, publicBioForLocale } from "@/lib/translation/public-bio";

import { templateKeyForPlan } from "@/lib/talent-site/templates/registry";
import { buildTemplateSnapshot } from "@/lib/talent-site/templates/build-template-snapshot";
import type { TalentPortfolioStarterMedia, TalentPortfolioStarterProfile } from "../starter";
import type { TalentSiteSnapshot } from "../types";

export async function loadTalentStarterProfileData(
  talentProfileId: string,
): Promise<TalentPortfolioStarterProfile | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const trusted = createServiceRoleClient() ?? supabase;

  const { data: profileRow, error } = await trusted
    .from("talent_profiles")
    .select(`
      id,
      display_name,
      first_name,
      last_name,
      profile_code,
      short_bio,
      bio_en,
      talent_profile_taxonomy (
        relationship_type,
        taxonomy_terms ( name_en )
      ),
      talent_service_areas (
        service_kind,
        locations ( display_name_en )
      )
    `)
    .eq("id", talentProfileId)
    .maybeSingle();

  if (error || !profileRow) {
    if (error) logServerError("talentSite.loadStarterProfile", error);
    return null;
  }

  type ProfileRaw = {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_code: string | null;
    short_bio: string | null;
    bio_en: string | null;
    talent_profile_taxonomy: {
      relationship_type: string | null;
      taxonomy_terms: { name_en: string | null } | null;
    }[] | null;
    talent_service_areas: {
      service_kind: string | null;
      locations: { display_name_en: string | null } | null;
    }[] | null;
  };

  const p = profileRow as unknown as ProfileRaw;
  if (!p.profile_code?.trim()) return null;

  const displayName =
    p.display_name?.trim() ||
    `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
    "Unnamed";

  const primaryTypeLabel =
    (p.talent_profile_taxonomy ?? [])
      .find((t) => t.relationship_type === "primary_role")
      ?.taxonomy_terms?.name_en ?? null;

  const homeCity =
    (p.talent_service_areas ?? [])
      .find((a) => a.service_kind === "home_base")
      ?.locations?.display_name_en ?? null;

  const serviceAreaLabels = (p.talent_service_areas ?? [])
    .map((a) => a.locations?.display_name_en?.trim())
    .filter((label): label is string => !!label);

  const { data: mediaRows } = await trusted
    .from("media_assets")
    .select("storage_path, variant_kind")
    .eq("owner_talent_profile_id", talentProfileId)
    // Real media_variant_kind values only — `portfolio` is not an enum member
    // (it errors the whole .in query); `hero` is the valid 4:5 cover variant.
    .in("variant_kind", ["public_watermarked", "gallery", "card", "hero"])
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(12);

  const BUCKET = "media-public";
  const media: TalentPortfolioStarterMedia[] = (mediaRows ?? []).map((row) => {
    const r = row as { storage_path: string };
    const url = trusted.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl;
    return { url, alt: displayName };
  });

  const headshotUrl = media[0]?.url ?? null;

  return {
    displayName,
    profileCode: p.profile_code,
    primaryTypeLabel,
    publicBio:
      publicBioForLocale("en", p.bio_en, null).trim() ||
      canonicalBioEn(p.bio_en, p.short_bio) ||
      null,
    homeCity,
    serviceAreaLabels,
    headshotUrl,
  };
}

export async function buildStarterSnapshotForTalent(
  talentProfileId: string,
  planKey?: string | null,
): Promise<TalentSiteSnapshot | null> {
  const profile = await loadTalentStarterProfileData(talentProfileId);
  if (!profile) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const trusted = createServiceRoleClient() ?? supabase;

  const { data: mediaRows } = await trusted
    .from("media_assets")
    .select("storage_path")
    .eq("owner_talent_profile_id", talentProfileId)
    // Real media_variant_kind values only — `portfolio` is not an enum member
    // (it errors the whole .in query); `hero` is the valid 4:5 cover variant.
    .in("variant_kind", ["public_watermarked", "gallery", "hero"])
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(12);

  const BUCKET = "media-public";
  const media: TalentPortfolioStarterMedia[] = (mediaRows ?? []).map((row) => {
    const r = row as { storage_path: string };
    return {
      url: trusted.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
      alt: profile.displayName,
    };
  });

  const templateKey = templateKeyForPlan(planKey ?? "talent_basic");
  return buildTemplateSnapshot(templateKey, { profile, media });
}
