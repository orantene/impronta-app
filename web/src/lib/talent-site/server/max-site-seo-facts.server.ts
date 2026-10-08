import "server-only";

import { offeringsToJsonLdServices, type TalentJsonLdService } from "@/lib/seo/talent-json-ld";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { cityLabelFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";

import { pick, type LocalizedMapLike } from "../talent-locale-swaps";
import { loadOwnHosts } from "./own-hosts.server";
import { canonicalCityLabel } from "./city-label.server";
import { loadTalentSocialLinks } from "./talent-social-links";

/** What `buildMaxSiteSeo` needs beyond the page row (TUL-74). Any failure degrades to "none". */
export interface MaxSiteSeoFacts {
  services: TalentJsonLdService[];
  sameAs: string[];
  addressLocality: string | null;
  /** #201: the talent's custom domains + platform subdomain; hosts an explicit canonical may name. */
  ownHosts: string[];
  /** TUL-411: locale-resolved short bio for meta-description fallback when the page SEO is empty/scrubbed. */
  bio: string | null;
  /** TUL-411: primary talent-type label in the visitor locale (structured meta fallback). */
  talentType: string | null;
}

async function loadCity(talentProfileId: string, locale: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("home_city_text, talent_service_areas ( service_kind, locations ( display_name_i18n ) )")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    home_city_text: string | null;
    talent_service_areas: Array<{ service_kind: string; locations: { display_name_i18n: LocalizedMapLike } | null }> | null;
  };
  const map = (row.talent_service_areas ?? []).find((a) => a.service_kind === "home_base")?.locations?.display_name_i18n;
  const hint = cityLabelFromPlaceText(row.home_city_text);
  const raw = pick(map, locale.toLowerCase().startsWith("es") ? "es" : "en", [locale]) || hint || "";
  return raw ? (await canonicalCityLabel(admin, raw, locale, [hint])) || null : null;
}

async function loadBioAndType(
  talentProfileId: string,
  locale: string,
): Promise<{ bio: string | null; talentType: string | null }> {
  const admin = createServiceRoleClient();
  if (!admin) return { bio: null, talentType: null };
  const { data, error } = await admin
    .from("talent_profiles")
    .select(
      "short_bio, bio_i18n, talent_profile_taxonomy ( is_primary, relationship_type, taxonomy_terms ( kind, name_i18n ) )",
    )
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) {
    if (error) logServerError("talentSite.seoFacts.bioType", error);
    return { bio: null, talentType: null };
  }
  const row = data as unknown as {
    short_bio: string | null;
    bio_i18n: LocalizedMapLike | null;
    talent_profile_taxonomy: Array<{
      is_primary: boolean | null;
      relationship_type: string | null;
      taxonomy_terms: { kind: string | null; name_i18n: LocalizedMapLike } | null;
    }> | null;
  };
  const loc = locale.toLowerCase().startsWith("es") ? "es" : "en";
  const bio = pick(row.bio_i18n, loc, [locale]) || row.short_bio?.trim() || null;
  const types = (row.talent_profile_taxonomy ?? []).filter((t) => t.taxonomy_terms?.kind === "talent_type");
  const primary =
    types.find((t) => t.is_primary) ??
    types.find((t) => t.relationship_type === "primary_role") ??
    types[0];
  const talentType = primary?.taxonomy_terms?.name_i18n
    ? pick(primary.taxonomy_terms.name_i18n, loc, [locale]) || null
    : null;
  return { bio, talentType };
}

export async function loadMaxSiteSeoFacts(talentProfileId: string, locale: string): Promise<MaxSiteSeoFacts> {
  const [offerings, social, city, ownHosts, bioType] = await Promise.all([
    loadPublicOfferingsForProfile(talentProfileId, locale, null).catch(() => []),
    loadTalentSocialLinks(talentProfileId).catch(() => []),
    loadCity(talentProfileId, locale).catch((err) => {
      logServerError("talentSite.seoFacts.city", err);
      return null;
    }),
    loadOwnHosts(talentProfileId).catch((err) => {
      logServerError("talentSite.seoFacts.ownHosts", err);
      return [] as string[];
    }),
    loadBioAndType(talentProfileId, locale).catch((err) => {
      logServerError("talentSite.seoFacts.bioType", err);
      return { bio: null, talentType: null };
    }),
  ]);
  return {
    services: offeringsToJsonLdServices(offerings),
    sameAs: social.filter((s) => s.platform !== "whatsapp").map((s) => s.href),
    addressLocality: city,
    ownHosts,
    bio: bioType.bio,
    talentType: bioType.talentType,
  };
}
