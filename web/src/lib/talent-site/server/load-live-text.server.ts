import "server-only";

import { loadVisitSources } from "@/lib/site-admin/builder-node/visit-sources";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { readScalarFieldValuesFromCatalog } from "@/lib/talent/scalar-field-values-catalog";

import type { TalentLiveText } from "../live-text";
import { buildTalentLiveText, type LiveTextSource } from "../live-text-values";
import type { LocalizedMapLike } from "../talent-locale-swaps";
import { loadTalentSocialLinks } from "./talent-social-links";
import { loadProofInput } from "./talent-locale-swaps.server";

type Row = {
  display_name: string | null;
  first_name: string | null;
  talent_profile_taxonomy:
    | Array<{
        is_primary: boolean | null;
        display_order: number | null;
        taxonomy_terms: { kind: string | null; name_i18n: LocalizedMapLike } | null;
      }>
    | null;
  talent_service_areas:
    | Array<{ service_kind: string | null; locations: { display_name_i18n: LocalizedMapLike } | null }>
    | null;
};

const EMPTY: TalentLiveText = { values: {} };

/**
 * The live text of one talent in `locale`: her headline, tagline, trade and
 * city, years, languages, rating, zone, hours and Instagram, each read at the
 * moment of the render. Any failure degrades to "no data" (the stored text
 * stays), never an error.
 */
export async function loadTalentLiveText(
  talentProfileId: string,
  locale: string | null | undefined,
  chain: readonly string[] = [],
): Promise<TalentLiveText> {
  const admin = createServiceRoleClient();
  if (!admin || !talentProfileId) return EMPTY;
  try {
    const { data, error } = await admin
      .from("talent_profiles")
      .select(`
        display_name, first_name,
        talent_profile_taxonomy ( is_primary, display_order, taxonomy_terms ( kind, name_i18n ) ),
        talent_service_areas ( service_kind, locations ( display_name_i18n ) )
      `)
      .eq("id", talentProfileId)
      .maybeSingle();
    if (error || !data) {
      if (error) logServerError("talentSite.liveText.profile", error);
      return EMPTY;
    }
    const row = data as unknown as Row;
    const trade = (row.talent_profile_taxonomy ?? [])
      .filter((t) => t.taxonomy_terms?.kind === "talent_type")
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0))[0]
      ?.taxonomy_terms?.name_i18n;
    const city = (row.talent_service_areas ?? []).find((a) => a.service_kind === "home_base")?.locations
      ?.display_name_i18n;

    const [scalars, proof, visit, social] = await Promise.all([
      readScalarFieldValuesFromCatalog(admin, talentProfileId),
      loadProofInput(admin, talentProfileId),
      loadVisitSources(talentProfileId, locale ?? "en"),
      loadTalentSocialLinks(talentProfileId),
    ]);
    const src: LiveTextSource = {
      displayName: row.display_name?.trim() || row.first_name?.trim() || "",
      trade,
      city,
      headline: scalars.headline ?? null,
      tagline: scalars.tagline ?? null,
      // `years_total` from the profile editor wins; the proof loader's read is the fallback.
      proof: { ...proof, years: scalars.years_total ?? proof.years },
      place: visit.talentVisitFacts.find((f) => f.icon === "place")?.value ?? null,
      hoursDays: visit.talentVisitFacts.find((f) => f.icon === "hours")?.value ?? null,
      instagramHref: social.find((s) => s.platform === "instagram")?.href ?? null,
    };
    return buildTalentLiveText(src, locale, chain);
  } catch (err) {
    logServerError("talentSite.liveText", err);
    return EMPTY;
  }
}
