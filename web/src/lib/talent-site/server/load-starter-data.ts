import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { canonicalBioEn } from "@/lib/translation/public-bio";
import { effectiveBioI18n, pickBio } from "@/lib/translation/bios-to-bio-i18n";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { readScalarFieldValuesFromCatalog } from "@/lib/talent/scalar-field-values-catalog";
import { cityLabelFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";

import { templateKeyForPlan } from "@/lib/talent-site/templates/registry";
import { buildTemplateSnapshot } from "@/lib/talent-site/templates/build-template-snapshot";
import { normalizeServicesMenu } from "@/lib/talent/services-menu-types";
import { loadHeroProofData } from "./load-hero-proof";
import { canonicalCityLabel } from "./city-label.server";
import { pickHeadshotUrl } from "../media-pick";
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
      phone,
      phone_e164,
      social_links,
      talent_plan_key,
      short_bio,
      bio_i18n,
      services_menu,
      home_city_text,
      talent_profile_taxonomy (
        relationship_type,
        is_primary,
        display_order,
        taxonomy_terms ( kind, name_i18n )
      ),
      talent_service_areas (
        service_kind,
        locations ( display_name_i18n )
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
    phone: string | null;
    phone_e164: string | null;
    social_links: unknown;
    talent_plan_key: string | null;
    short_bio: string | null;
    bio_i18n: LocalizedMap | null;
    services_menu: unknown;
    home_city_text: string | null;
    talent_profile_taxonomy: {
      relationship_type: string | null;
      is_primary: boolean | null;
      display_order: number | null;
      taxonomy_terms: {
        kind: string | null;
        name_i18n: Record<string, string | null> | null;
      } | null;
    }[] | null;
    talent_service_areas: {
      service_kind: string | null;
      locations: { display_name_i18n: Record<string, string | null> | null } | null;
    }[] | null;
  };

  const p = profileRow as unknown as ProfileRaw;
  if (!p.profile_code?.trim()) return null;

  const displayName =
    p.display_name?.trim() ||
    `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
    "Unnamed";

  // Talent-type taxonomy — primary first, then the rest as secondaries. Mirrors
  // the canonical public profile page (kind === "talent_type", `is_primary`
  // flag, `display_order` ordering). The snapshot renders in English (the
  // resolver hardcodes locale "en"), so labels use `name_i18n.en`.
  const talentTypeRows = (p.talent_profile_taxonomy ?? [])
    .filter((t) => t.taxonomy_terms?.kind === "talent_type")
    .slice()
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const primaryTalentTypeLabel =
    talentTypeRows.find((t) => t.is_primary)?.taxonomy_terms?.name_i18n?.en?.trim() ??
    null;

  // Backward-compatible: prefer the `is_primary` talent_type; fall back to the
  // legacy `relationship_type === "primary_role"` lookup so this never regresses
  // for rows that only set the relationship_type.
  const primaryTypeLabel =
    primaryTalentTypeLabel ||
    (p.talent_profile_taxonomy ?? [])
      .find((t) => t.relationship_type === "primary_role")
      ?.taxonomy_terms?.name_i18n?.en?.trim() ||
    null;

  // All non-primary talent types (de-duped, primary label excluded), e.g.
  // ["Photographer","Stylist"] — drives the default profile's discipline chips.
  const secondaryTypeLabels = (() => {
    const seen = new Set<string>();
    if (primaryTypeLabel) seen.add(primaryTypeLabel);
    const out: string[] = [];
    for (const row of talentTypeRows) {
      if (row.is_primary) continue;
      const label = row.taxonomy_terms?.name_i18n?.en?.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(label);
    }
    return out;
  })();

  // Service-area home base first, else the city the drawer saved (F30).
  const homeCityRaw =
    (p.talent_service_areas ?? [])
      .find((a) => a.service_kind === "home_base")
      ?.locations?.display_name_i18n?.en?.trim() ||
    cityLabelFromPlaceText(p.home_city_text);
  // Place text can be ASCII-folded ("Cancun"); restore the location's accent.
  const homeCity = homeCityRaw ? await canonicalCityLabel(trusted, homeCityRaw, "en", [cityLabelFromPlaceText(p.home_city_text)]) : homeCityRaw;

  const serviceAreaLabels = (p.talent_service_areas ?? [])
    .map((a) => a.locations?.display_name_i18n?.en?.trim())
    .filter((label): label is string => !!label);

  // Public, active services-menu names (active + non-agency_only), ordered by
  // the menu's sortOrder — mirrors the public profile's services filter. Drives
  // the default freeform profile's "Services & focus" cards. NOT the geographic
  // `serviceAreaLabels`.
  const menuNames = normalizeServicesMenu(p.services_menu)
    .filter((it) => it.isActive && it.visibility !== "agency_only")
    .map((it) => it.name.trim())
    .filter((name): name is string => name.length > 0);
  // F26: services created in Services live in talent_offerings, not the
  // legacy menu; a talent with published offerings shows THEIR names.
  const serviceNames = menuNames.length > 0 ? menuNames : await loadPublishedServiceNames(trusted, talentProfileId);

  const { data: mediaRows } = await trusted
    .from("media_assets")
    .select("storage_path, variant_kind, sort_order")
    .eq("owner_talent_profile_id", talentProfileId)
    // Real media_variant_kind values only — `portfolio` is not an enum member
    // (it errors the whole .in query); `hero` is the valid 4:5 cover variant.
    .in("variant_kind", ["public_watermarked", "gallery", "card", "hero"])
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(12);

  const BUCKET = "media-public";
  const mediaRowsTyped = (mediaRows ?? []) as Array<{
    storage_path: string;
    variant_kind: string;
    sort_order: number | null;
  }>;
  const media: TalentPortfolioStarterMedia[] = mediaRowsTyped.map((r) => {
    const url = trusted.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl;
    return { url, alt: displayName };
  });

  // Prefer card/portrait over gallery work shots (demos already use MediaUrls.card).
  const headshotUrl =
    pickHeadshotUrl(
      mediaRowsTyped.map((r) => ({
        url: trusted.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
        variantKind: r.variant_kind,
        sortOrder: r.sort_order,
      })),
    ) ?? null;

  // The full published bio (locale-resolved, NOT sliced). Same resolution the
  // slot templates use for `publicBio`, but the default freeform About renders
  // it in full as a proper paragraph. "" when none.
  // F25: bio_i18n per locale, filled by the drawer's saved `bios` value.
  const bios = (await readBlobFieldValuesFromCatalog(trusted, talentProfileId)).bios;
  const richBio =
    pickBio(effectiveBioI18n(p.bio_i18n, bios), "en") || canonicalBioEn(null, p.short_bio) || "";

  // Cheap, single extra query — joined spoken-language names ("Spanish · English"),
  // ordered the way the public profile orders them. "" when none / on error.
  const { data: languageRows } = await trusted
    .from("talent_languages")
    .select("language_name, display_order")
    .eq("talent_profile_id", talentProfileId)
    .order("display_order", { ascending: true })
    .order("language_name", { ascending: true });

  const languagesLabel = (languageRows ?? [])
    .map((row) => (row as { language_name: string | null }).language_name?.trim())
    .filter((name): name is string => !!name)
    .join(" · ");

  const proof = await loadHeroProofData(trusted, talentProfileId);
  // Her own headline and tagline (profile fields), and the currency of her menu.
  const [scalars, menuCurrency] = await Promise.all([
    readScalarFieldValuesFromCatalog(trusted, talentProfileId),
    loadMenuCurrency(trusted, talentProfileId),
  ]);

  return {
    displayName,
    profileCode: p.profile_code,
    primaryTypeLabel,
    secondaryTypeLabels,
    publicBio: richBio || null,
    richBio,
    languagesLabel,
    experienceYears: proof.years,
    headline: scalars.headline ?? null,
    tagline: scalars.tagline ?? null,
    menuCurrency,
    ratingAvg: proof.rating,
    ratingCount: proof.count,
    isDemo: proof.demo,
    homeCity,
    serviceAreaLabels,
    serviceNames,
    headshotUrl,
    phone: p.phone,
    phoneE164: p.phone_e164,
    socialLinks: p.social_links,
    talentPlanKey: p.talent_plan_key,
  };
}

type Db = Pick<SupabaseClient, "from">;

/** The currency most of her published services are priced in ("MXN"), or null. */
export async function loadMenuCurrency(db: Db, talentProfileId: string): Promise<string | null> {
  const { data, error } = await db
    .from("talent_offerings")
    .select("currency")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"])
    .not("currency", "is", null)
    .limit(50);
  if (error) {
    logServerError("talentSite.loadStarterMenuCurrency", error);
    return null;
  }
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { currency: string | null }[]) {
    const code = row.currency?.trim().toUpperCase();
    if (code && code.length >= 3) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Published, approved, public service titles in the talent's order. */
async function loadPublishedServiceNames(db: Db, talentProfileId: string): Promise<string[]> {
  const { data, error } = await db
    .from("talent_offerings")
    .select("title, title_i18n")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .in("visibility", ["public", "on_request"])
    .order("sort_order", { ascending: true })
    .limit(12);
  if (error) {
    logServerError("talentSite.loadStarterServiceNames", error);
    return [];
  }
  return ((data ?? []) as { title: string | null; title_i18n: Record<string, string | null> | null }[])
    .map((row) => (row.title_i18n?.en ?? row.title ?? "").trim())
    .filter((name) => name.length > 0);
}

/**
 * Public, approved, ordered portfolio media for a talent — the same query the
 * starter snapshot + the template preview both consume so they render the same
 * gallery. Returns [] on no media / no client. `altName` labels the alt text.
 */
export async function loadTalentStarterMedia(
  talentProfileId: string,
  altName: string,
): Promise<TalentPortfolioStarterMedia[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
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
  return (mediaRows ?? []).map((row) => {
    const r = row as { storage_path: string };
    return {
      url: trusted.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
      alt: altName,
    };
  });
}

export async function buildStarterSnapshotForTalent(
  talentProfileId: string,
  planKey?: string | null,
): Promise<TalentSiteSnapshot | null> {
  const profile = await loadTalentStarterProfileData(talentProfileId);
  if (!profile) return null;

  const media = await loadTalentStarterMedia(talentProfileId, profile.displayName);

  const templateKey = templateKeyForPlan(planKey ?? "talent_basic");
  return buildTemplateSnapshot(templateKey, { profile, media });
}
