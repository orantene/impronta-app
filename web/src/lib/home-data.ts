import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { FeaturedTalentCard } from "@/components/home/featured-talent-section";
import type { FitLabelItem } from "@/components/home/best-for-section";
import type { LocationItem } from "@/components/home/location-section";
import {
  formatCityCountryLabel,
  resolveResidenceLocationEmbed,
  type CanonicalLocationEmbed,
} from "@/lib/canonical-location-display";

export async function getHomepageData() {
  if (!isSupabaseConfigured()) {
    return { talentTypes: [], featuredTalent: [], fitLabels: [], locations: [] };
  }

  const supabase = createPublicSupabaseClient()!;

  /**
   * Product exception — marketing / curated discovery:
   * Featured strip, role shortcuts, fit-label pills, and location boxes read profiles, taxonomy, and media
   * directly. They intentionally do not consult Admin → Fields visibility (unlike directory cards and public
   * profile detail). Rationale: the homepage is agency-controlled promotion; aligning it with field toggles would
   * require defining which toggles apply to which marketing widgets and risks hiding featured talent entirely.
   * Smallest future alignment would be per-widget (e.g. hide a featured card if profile is non-public) — not
   * field-definition-driven copy of directory rules.
   */
  const [typesRes, featuredRes, fitRes, locationsRes] = await Promise.all([
    supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en")
      .eq("kind", "talent_type")
      .is("archived_at", null)
      .order("sort_order"),

    supabase
      .from("talent_profiles")
      .select(`
        id,
        profile_code,
        display_name,
        is_featured,
        location_id,
        residence_city_id,
        residence_city:locations!residence_city_id ( display_name_en, display_name_es, country_code ),
        legacy_location:locations!location_id ( display_name_en, display_name_es, country_code ),
        talent_profile_taxonomy (
          is_primary,
          taxonomy_terms ( kind, name_en )
        )
      `)
      .eq("workflow_status", "approved")
      .eq("visibility", "public")
      .eq("is_featured", true)
      .is("deleted_at", null)
      .order("featured_level", { ascending: false })
      .order("featured_position", { ascending: true })
      .limit(8),

    supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en")
      .eq("kind", "fit_label")
      .is("archived_at", null)
      .order("sort_order"),

    supabase
      .from("locations")
      .select("id, city_slug, display_name_en, country_code")
      .is("archived_at", null)
      .order("display_name_en"),
  ]);

  const talentTypes = (typesRes.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name_en,
  }));

  // Get thumbnail for each featured talent
  const featuredIds = (featuredRes.data ?? []).map((t) => t.id);
  const thumbnailMap: Record<string, string> = {};

  if (featuredIds.length > 0) {
    const { data: mediaRows } = await supabase
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in("owner_talent_profile_id", featuredIds)
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .in("variant_kind", ["card", "public_watermarked", "gallery"])
      .order("variant_kind")
      .order("sort_order");

    for (const row of mediaRows ?? []) {
      if (!thumbnailMap[row.owner_talent_profile_id] && row.storage_path) {
        const { data: urlData } = supabase.storage
          .from("media-public")
          .getPublicUrl(row.storage_path);
        if (urlData?.publicUrl) {
          thumbnailMap[row.owner_talent_profile_id] = urlData.publicUrl;
        }
      }
    }
  }

  const featuredTalent: FeaturedTalentCard[] = (featuredRes.data ?? []).map(
    (t) => {
      const taxonomy = (t.talent_profile_taxonomy ?? []) as {
        is_primary: boolean;
        taxonomy_terms: { kind: string; name_en: string } | { kind: string; name_en: string }[] | null;
      }[];
      const primaryType = taxonomy.find((x) => x.is_primary);
      let typeLabel = "Talent";
      if (primaryType?.taxonomy_terms) {
        const terms = Array.isArray(primaryType.taxonomy_terms)
          ? primaryType.taxonomy_terms
          : [primaryType.taxonomy_terms];
        const tt = terms.find((t) => t.kind === "talent_type");
        if (tt) typeLabel = tt.name_en;
      }

      const residenceRow = resolveResidenceLocationEmbed({
        residence_city: t.residence_city as
          | CanonicalLocationEmbed
          | CanonicalLocationEmbed[]
          | null,
        legacy_location: t.legacy_location as
          | CanonicalLocationEmbed
          | CanonicalLocationEmbed[]
          | null,
      });
      const loc = formatCityCountryLabel("en", residenceRow);

      return {
        id: t.id,
        profileCode: t.profile_code,
        displayName: t.display_name ?? "Talent",
        talentType: typeLabel,
        location: loc,
        thumbnailUrl: thumbnailMap[t.id] ?? null,
      };
    },
  );

  const fitLabels: FitLabelItem[] = (fitRes.data ?? []).map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name_en,
  }));

  // Count talent per location
  const locationData = locationsRes.data ?? [];
  const locationIds = locationData.map((l) => l.id);
  const locationCounts: Record<string, number> = {};

  if (locationIds.length > 0) {
    const { data: countRows } = await supabase
      .from("talent_profiles")
      .select("residence_city_id, location_id")
      .eq("workflow_status", "approved")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .or(
        `residence_city_id.in.(${locationIds.join(",")}),location_id.in.(${locationIds.join(",")})`,
      );

    for (const row of countRows ?? []) {
      const r = row as { residence_city_id: string | null; location_id: string | null };
      const effective = r.residence_city_id ?? r.location_id;
      if (effective) {
        locationCounts[effective] = (locationCounts[effective] ?? 0) + 1;
      }
    }
  }

  const locations: LocationItem[] = locationData.map((l) => ({
    id: l.id,
    citySlug: l.city_slug,
    displayName: l.display_name_en,
    countryCode: l.country_code,
    talentCount: locationCounts[l.id] ?? 0,
  }));

  return { talentTypes, featuredTalent, fitLabels, locations };
}
