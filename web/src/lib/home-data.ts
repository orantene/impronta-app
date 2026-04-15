import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { logServerError } from "@/lib/server/safe-error";
import type { FeaturedTalentCard } from "@/components/home/featured-talent-section";
import type { FitLabelItem } from "@/components/home/best-for-section";
import type { LocationItem, LocationFeaturedPreview } from "@/components/home/location-section";
import { resolveLocationMapCoordinates } from "@/lib/home-location-centroids";

function parseLocationCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
import {
  formatCityCountryLabel,
  resolveResidenceLocationEmbed,
  type CanonicalLocationEmbed,
} from "@/lib/canonical-location-display";
import {
  isMissingTaxonomyPromoColumnsError,
  TAXONOMY_PLACEMENT_HOME_BROWSE_BY_TYPE,
} from "@/lib/taxonomy/taxonomy-promo";

export async function getHomepageData() {
  if (!isSupabaseConfigured()) {
    return { talentTypes: [], featuredTalent: [], fitLabels: [], locations: [] };
  }

  const supabase = createPublicSupabaseClient()!;

  /**
   * Product exception — marketing / curated discovery:
   * Featured strip uses the same **talent row** gates as public directory listings (`workflow_status=approved`,
   * `visibility=public`, `deleted_at` null). Role shortcuts, fit-label pills, and location boxes read taxonomy
   * and locations directly. Widgets do **not** mirror Admin → Fields visibility for card attributes (unlike
   * directory cards / public profile field rules). Rationale: homepage is agency-controlled promotion; full
   * field-definition parity would risk hiding featured talent entirely. Future alignment can be per-widget.
   */
  const typesFull = await supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en, promo_image_storage_path, promo_placements")
    .eq("kind", "talent_type")
    .is("archived_at", null)
    .order("sort_order");

  type TalentTypeRow = {
    id: string;
    slug: string;
    name_en: string;
    promo_image_storage_path?: string | null;
    promo_placements?: string[] | null;
  };

  let talentTypeRows: TalentTypeRow[] = [];
  if (!typesFull.error && typesFull.data) {
    talentTypeRows = typesFull.data as TalentTypeRow[];
  } else if (typesFull.error && isMissingTaxonomyPromoColumnsError(typesFull.error)) {
    const leg = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en")
      .eq("kind", "talent_type")
      .is("archived_at", null)
      .order("sort_order");
    if (leg.error) {
      logServerError("home/getHomepageData/talentTypes", leg.error);
    } else {
      talentTypeRows = (leg.data ?? []).map((t) => ({
        ...(t as { id: string; slug: string; name_en: string }),
        promo_image_storage_path: null,
        promo_placements: [] as string[],
      }));
    }
  } else if (typesFull.error) {
    logServerError("home/getHomepageData/talentTypes", typesFull.error);
  }

  const [featuredRes, fitRes, locationsRes] = await Promise.all([
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
      .select("id, city_slug, display_name_en, country_code, latitude, longitude")
      .is("archived_at", null)
      .order("display_name_en"),
  ]);

  const talentTypes = talentTypeRows.map((t) => {
    const placements = t.promo_placements ?? [];
    const path = t.promo_image_storage_path;
    const showPromo =
      Boolean(path) &&
      Array.isArray(placements) &&
      placements.includes(TAXONOMY_PLACEMENT_HOME_BROWSE_BY_TYPE);
    const imageUrl = showPromo && path
      ? supabase.storage.from("media-public").getPublicUrl(path).data.publicUrl ?? null
      : null;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name_en,
      imageUrl,
    };
  });

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
  // Map of locationId -> up to 10 talent IDs (featured first)
  const locationPreviewIds: Record<string, string[]> = {};

  if (locationIds.length > 0) {
    const { data: countRows } = await supabase
      .from("talent_profiles")
      .select("id, residence_city_id, location_id, is_featured, featured_level")
      .eq("workflow_status", "approved")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .or(
        `residence_city_id.in.(${locationIds.join(",")}),location_id.in.(${locationIds.join(",")})`,
      )
      .order("is_featured", { ascending: false })
      .order("featured_level", { ascending: false })
      .limit(500);

    for (const row of countRows ?? []) {
      const r = row as {
        id: string;
        residence_city_id: string | null;
        location_id: string | null;
        is_featured: boolean;
        featured_level: number | null;
      };
      const effective = r.residence_city_id ?? r.location_id;
      if (effective) {
        locationCounts[effective] = (locationCounts[effective] ?? 0) + 1;
        const bucket = (locationPreviewIds[effective] ??= []);
        if (bucket.length < 10) bucket.push(r.id);
      }
    }
  }

  // Batch-fetch thumbnails for all preview talent IDs
  const allPreviewIds = Object.values(locationPreviewIds).flat();
  const locationThumbnailMap: Record<string, string> = {};

  if (allPreviewIds.length > 0) {
    const { data: previewMedia } = await supabase
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in("owner_talent_profile_id", allPreviewIds)
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .in("variant_kind", ["card", "public_watermarked", "gallery"])
      .order("variant_kind")
      .order("sort_order");

    for (const row of previewMedia ?? []) {
      if (!locationThumbnailMap[row.owner_talent_profile_id] && row.storage_path) {
        const { data: urlData } = supabase.storage
          .from("media-public")
          .getPublicUrl(row.storage_path);
        if (urlData?.publicUrl) {
          locationThumbnailMap[row.owner_talent_profile_id] = urlData.publicUrl;
        }
      }
    }
  }

  const locations: LocationItem[] = locationData.map((l) => {
    const dbLat = parseLocationCoord(l.latitude);
    const dbLng = parseLocationCoord(l.longitude);
    const resolved = resolveLocationMapCoordinates(l.city_slug, dbLat, dbLng);
    const previewIds = locationPreviewIds[l.id] ?? [];
    const featuredPreviews: LocationFeaturedPreview[] = previewIds.map((tid) => ({
      talentId: tid,
      thumbnailUrl: locationThumbnailMap[tid] ?? null,
    }));
    return {
      id: l.id,
      citySlug: l.city_slug,
      displayName: l.display_name_en,
      countryCode: l.country_code,
      talentCount: locationCounts[l.id] ?? 0,
      latitude: resolved?.lat ?? null,
      longitude: resolved?.lng ?? null,
      featuredPreviews,
    };
  });

  return { talentTypes, featuredTalent, fitLabels, locations };
}
