import "server-only";

import { offeringsToJsonLdServices, type TalentJsonLdService } from "@/lib/seo/talent-json-ld";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { cityLabelFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";

import { pick, type LocalizedMapLike } from "../talent-locale-swaps";
import { canonicalCityLabel } from "./city-label.server";
import { loadTalentSocialLinks } from "./talent-social-links";

/** What `buildMaxSiteSeo` needs beyond the page row (TUL-74). Any failure degrades to "none". */
export interface MaxSiteSeoFacts {
  services: TalentJsonLdService[];
  sameAs: string[];
  addressLocality: string | null;
  /** #201: the talent's custom domains; hosts an explicit canonical may name. */
  ownHosts: string[];
}

async function loadOwnHosts(talentProfileId: string): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin.from("talent_site_domains").select("domain").eq("talent_profile_id", talentProfileId);
  if (error) throw error;
  return ((data ?? []) as Array<{ domain: string | null }>).map((r) => r.domain ?? "").filter(Boolean);
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

export async function loadMaxSiteSeoFacts(talentProfileId: string, locale: string): Promise<MaxSiteSeoFacts> {
  const [offerings, social, city, ownHosts] = await Promise.all([
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
  ]);
  return {
    services: offeringsToJsonLdServices(offerings),
    sameAs: social.filter((s) => s.platform !== "whatsapp").map((s) => s.href),
    addressLocality: city,
    ownHosts,
  };
}
