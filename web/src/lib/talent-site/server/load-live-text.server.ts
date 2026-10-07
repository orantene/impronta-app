import "server-only";

import { loadVisitSources } from "@/lib/site-admin/builder-node/visit-sources";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { zoneLabel } from "@/lib/talent/location-settings";
import { readScalarFieldValuesFromCatalog } from "@/lib/talent/scalar-field-values-catalog";

import { effectiveBioI18n } from "@/lib/translation/bios-to-bio-i18n";
import { cityLabelFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import type { TalentLiveText } from "../live-text";
import { buildTalentLiveText, type LiveTextSource } from "../live-text-values";
import { pick, type LocalizedMapLike } from "../talent-locale-swaps";
import { canonicalCityLabel } from "./city-label.server";
import { loadMenuCurrency } from "./load-starter-data";
import { loadTalentSocialLinks } from "./talent-social-links";
import { loadProofInput } from "./talent-locale-swaps.server";

type Row = {
  display_name: string | null;
  first_name: string | null;
  profile_code: string | null;
  short_bio: string | null;
  bio_i18n: LocalizedMapLike;
  preferred_locale: string | null;
  home_city_text: string | null;
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
        display_name, first_name, profile_code, short_bio, bio_i18n, preferred_locale, home_city_text,
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

    // The city as the Location section reads it: accented via the locations table, with her saved city text as the hint.
    const hint = cityLabelFromPlaceText(row.home_city_text);
    const cityRaw = pick(city, locale?.toLowerCase().startsWith("es") ? "es" : "en", chain) || hint || "";
    const cityLabel = cityRaw ? await canonicalCityLabel(admin, cityRaw, locale ?? "en", [hint]) : "";
    const [scalars, proof, visit, social, menuCurrency, blobs] = await Promise.all([
      readScalarFieldValuesFromCatalog(admin, talentProfileId),
      loadProofInput(admin, talentProfileId),
      loadVisitSources(talentProfileId, locale ?? "en"),
      loadTalentSocialLinks(talentProfileId),
      loadMenuCurrency(admin, talentProfileId),
      readBlobFieldValuesFromCatalog(admin, talentProfileId),
    ]);
    const src: LiveTextSource = {
      displayName: row.display_name?.trim() || row.first_name?.trim() || "",
      trade,
      city,
      cityLabel,
      headline: scalars.headline ?? null,
      tagline: scalars.tagline ?? null,
      headlineI18n: scalars.headline_i18n ?? null,
      taglineI18n: scalars.tagline_i18n ?? null,
      shortBio: row.short_bio,
      // TUL-230: the drawer's saved `bios` fill the locales bio_i18n lacks (same read as the locale swaps).
      bioI18n: effectiveBioI18n(row.bio_i18n, blobs.bios),
      primaryLocale: row.preferred_locale,
      seedKey: row.profile_code,
      // `years_total` from the profile editor wins; the proof loader's read is the fallback.
      proof: { ...proof, years: scalars.years_total ?? proof.years },
      // The same public zone the Location section shows ("García Ginerés, Mérida"), never the address.
      place:
        (visit.talentLocation ? zoneLabel(visit.talentLocation) : "") ||
        (visit.talentVisitFacts.find((f) => f.icon === "place")?.value ?? null),
      menuCurrency,
      hoursDays: visit.talentVisitFacts.find((f) => f.icon === "hours")?.value ?? null,
      instagramHref: social.find((s) => s.platform === "instagram")?.href ?? null,
      whatsappHref: social.find((s) => s.platform === "whatsapp")?.href ?? null,
    };
    return buildTalentLiveText(src, locale, chain);
  } catch (err) {
    logServerError("talentSite.liveText", err);
    return EMPTY;
  }
}
