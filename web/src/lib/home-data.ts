import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { logServerError } from "@/lib/server/safe-error";
import { listTalentIdsOnTenantRoster } from "@/lib/saas/talent-roster";
import type { FeaturedTalentCard } from "@/components/home/featured-talent-section";
import type { FitLabelItem } from "@/components/home/best-for-section";
import type { LocationItem, LocationFeaturedPreview } from "@/components/home/location-section";
import { resolveLocationMapCoordinates } from "@/lib/home-location-centroids";
import { extractPrimaryRoleTerm, type ProfileTaxonomyRow } from "@/lib/taxonomy/engine";

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

/**
 * Agency-homepage data for a single tenant storefront.
 *
 * `talent_profiles` is a global table; tenant visibility is governed by
 * `agency_talent_roster`. We resolve that roster once and use it as the
 * hard filter on every talent read so featured strips / location counts
 * never leak a peer tenant's approved & public talent.
 *
 * Caller must pass a resolved `tenantId` (from the host-context header).
 * If the roster is empty, the page renders with no talent cards — which
 * is the correct truthful state for a newly seeded tenant.
 */
export async function getHomepageData({ tenantId }: { tenantId: string }) {
  if (!isSupabaseConfigured()) {
    return { talentTypes: [], featuredTalent: [], fitLabels: [], locations: [] };
  }

  const supabase = createPublicSupabaseClient()!;

  const rosterTalentIds = await listTalentIdsOnTenantRoster(supabase, tenantId);
  const hasRoster = rosterTalentIds.length > 0;

  /**
   * Product exception — marketing / curated discovery:
   * Featured strip uses the same **talent row** gate as public directory listings
   * (`is_publicly_hidden=false`, `deleted_at` null; the agency directory eye is
   * enforced via `agency_talent_roster` RLS). Role shortcuts, fit-label pills, and location boxes read taxonomy
   * and locations directly. Widgets do **not** mirror Admin → Fields visibility for card attributes (unlike
   * directory cards / public profile field rules). Rationale: homepage is agency-controlled promotion; full
   * field-definition parity would risk hiding featured talent entirely. Future alignment can be per-widget.
   */
  // 2026 reset — storefront top-bar facet renders parent_category rows
  // (the 8-19 marketplace top-level groups), NOT every talent_type
  // (which is 400+ rows). Filter to the 8 with is_public_filter=TRUE
  // for the visible top bar; "More…" rollup is a UI-side concern.
  // The legacy fallback below preserves behavior for DBs that haven't
  // applied taxonomy v2 yet (term_type column absent).
  const typesFull = await supabase
    .from("taxonomy_terms")
    .select("id, slug, name_i18n, promo_image_storage_path, promo_placements")
    .eq("term_type", "parent_category")
    .eq("is_public_filter", true)
    .is("archived_at", null)
    .order("sort_order");

  type TalentTypeRow = {
    id: string;
    slug: string;
    name_i18n: Record<string, string | null> | null;
    promo_image_storage_path?: string | null;
    promo_placements?: string[] | null;
  };

  let talentTypeRows: TalentTypeRow[] = [];
  if (!typesFull.error && typesFull.data) {
    talentTypeRows = typesFull.data as TalentTypeRow[];
  } else if (typesFull.error && isMissingTaxonomyPromoColumnsError(typesFull.error)) {
    const leg = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_i18n")
      .eq("kind", "talent_type")
      .is("archived_at", null)
      .order("sort_order");
    if (leg.error) {
      logServerError("home/getHomepageData/talentTypes", leg.error);
    } else {
      talentTypeRows = (leg.data ?? []).map((t) => ({
        ...(t as { id: string; slug: string; name_i18n: Record<string, string | null> | null }),
        promo_image_storage_path: null,
        promo_placements: [] as string[],
      }));
    }
  } else if (typesFull.error) {
    logServerError("home/getHomepageData/talentTypes", typesFull.error);
  }

  const featuredQuery = hasRoster
    ? supabase
        .from("talent_profiles")
        .select(`
          id,
          profile_code,
          display_name,
          is_featured,
          location_id,
          residence_city_id,
          residence_city:locations!residence_city_id ( display_name_i18n, country_code ),
          legacy_location:locations!location_id ( display_name_i18n, country_code ),
          talent_profile_taxonomy (
            is_primary,
            taxonomy_terms ( kind, name_i18n )
          )
        `)
        .in("id", rosterTalentIds)
        .eq("is_publicly_hidden", false)
        .eq("is_featured", true)
        .neq("profile_kind", "resource")
        .is("deleted_at", null)
        .order("featured_level", { ascending: false })
        .order("featured_position", { ascending: true })
        .limit(8)
    : Promise.resolve({ data: [], error: null });

  // Per-division representative-image inputs — fetched in parallel with the
  // other homepage reads so they add ZERO serial latency on the (uncached,
  // force-dynamic) homepage path. Consumed by the divisionImageByTermId block
  // below. Skipped (empty) for a roster-less tenant.
  const divisionTermsQuery = hasRoster
    ? supabase.from("taxonomy_terms").select("id, parent_id").is("archived_at", null)
    : Promise.resolve({ data: [], error: null });
  const divisionRosterTaxQuery = hasRoster
    ? supabase
        .from("talent_profile_taxonomy")
        .select("talent_profile_id, taxonomy_term_id")
        .in("talent_profile_id", rosterTalentIds)
    : Promise.resolve({ data: [], error: null });

  const [featuredRes, fitRes, locationsRes, divisionTermsRes, divisionRosterTaxRes] =
    await Promise.all([
      featuredQuery,

      supabase
        .from("taxonomy_terms")
        .select("id, slug, name_i18n")
        .eq("kind", "fit_label")
        .is("archived_at", null)
        .order("sort_order"),

      supabase
        .from("locations")
        .select("id, city_slug, display_name_i18n, country_code, latitude, longitude")
        .is("archived_at", null)
        .order("display_name_i18n->>en"),

      divisionTermsQuery,
      divisionRosterTaxQuery,
    ]);

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

  // ── Per-division representative image (TENANT-SCOPED) ───────────────────────
  // Each homepage "division" card binds {{imageUrl}} to this. The division
  // taxonomy_terms are GLOBAL (one shared row per category), so writing a
  // promo_image onto them would leak THIS tenant's talent photo onto every
  // other tenant's homepage. Instead derive a representative photo from THIS
  // tenant's own roster talent in each category (featured talent preferred):
  // every tenant shows its own faces, and a category with no roster talent or
  // no approved image gracefully falls back to the text-only card. A curated
  // global promo image (promo_image_storage_path + the home-browse placement),
  // when an operator sets one, still wins over the derived photo.
  const divisionImageByTermId: Record<string, string> = {};
  if (hasRoster && talentTypeRows.length > 0) {
    // Divisions are parent_category roots; talent are tagged at descendant
    // leaves. Walk any tagged term UP to its root to find its division. The two
    // reads were issued in the Promise.all above (zero added serial latency).
    if (divisionTermsRes.error)
      logServerError("home/getHomepageData/divisionTaxonomy", divisionTermsRes.error);
    if (divisionRosterTaxRes.error)
      logServerError("home/getHomepageData/divisionRosterTax", divisionRosterTaxRes.error);
    const parentById = new Map<string, string | null>();
    for (const tr of (divisionTermsRes.data ?? []) as {
      id: string;
      parent_id: string | null;
    }[]) {
      parentById.set(tr.id, tr.parent_id);
    }
    const rootOf = (termId: string): string => {
      let cur = termId;
      for (let i = 0; i < 8; i += 1) {
        const parent = parentById.get(cur);
        if (!parent) break;
        cur = parent;
      }
      return cur;
    };
    const divisionIds = new Set(talentTypeRows.map((t) => t.id));

    const rosterTax = divisionRosterTaxRes.data;

    const featuredSet = new Set(featuredIds);
    const candidatesByDivision = new Map<string, string[]>();
    for (const row of (rosterTax ?? []) as {
      talent_profile_id: string;
      taxonomy_term_id: string;
    }[]) {
      const root = rootOf(row.taxonomy_term_id);
      if (!divisionIds.has(root)) continue;
      const arr = candidatesByDivision.get(root) ?? [];
      if (!arr.includes(row.talent_profile_id)) arr.push(row.talent_profile_id);
      candidatesByDivision.set(root, arr);
    }

    // Pick one representative talent per division — already-thumbnailed +
    // featured first — and note any whose image still needs fetching.
    const score = (id: string) =>
      (thumbnailMap[id] ? 2 : 0) + (featuredSet.has(id) ? 1 : 0);
    const pickByDivision = new Map<string, string>();
    const needImageFor = new Set<string>();
    for (const [divisionId, ids] of candidatesByDivision) {
      const ordered = [...ids].sort((a, b) => score(b) - score(a));
      const chosen = ordered.find((id) => thumbnailMap[id]) ?? ordered[0];
      if (!chosen) continue;
      pickByDivision.set(divisionId, chosen);
      if (!thumbnailMap[chosen]) needImageFor.add(chosen);
    }

    if (needImageFor.size > 0) {
      const { data: divMedia, error: divMediaErr } = await supabase
        .from("media_assets")
        .select("owner_talent_profile_id, storage_path, variant_kind")
        .in("owner_talent_profile_id", [...needImageFor])
        .eq("approval_state", "approved")
        .is("deleted_at", null)
        .in("variant_kind", ["card", "public_watermarked", "gallery"])
        .order("variant_kind")
        .order("sort_order");
      if (divMediaErr)
        logServerError("home/getHomepageData/divisionMedia", divMediaErr);
      for (const row of (divMedia ?? []) as {
        owner_talent_profile_id: string;
        storage_path: string | null;
      }[]) {
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

    for (const [divisionId, talentId] of pickByDivision) {
      const url = thumbnailMap[talentId];
      if (url) divisionImageByTermId[divisionId] = url;
    }
  }

  const talentTypes = talentTypeRows.map((t) => {
    const placements = t.promo_placements ?? [];
    const path = t.promo_image_storage_path;
    const showPromo =
      Boolean(path) &&
      Array.isArray(placements) &&
      placements.includes(TAXONOMY_PLACEMENT_HOME_BROWSE_BY_TYPE);
    const promoUrl =
      showPromo && path
        ? supabase.storage.from("media-public").getPublicUrl(path).data.publicUrl ?? null
        : null;
    // Curated global promo image wins; else this tenant's own roster photo.
    const imageUrl = promoUrl ?? divisionImageByTermId[t.id] ?? null;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name_i18n?.en ?? t.slug,
      imageUrl,
    };
  });

  const featuredTalent: FeaturedTalentCard[] = (featuredRes.data ?? []).map(
    (t) => {
      // Engine-driven extraction — handles v2 relationship_type='primary_role'
      // AND legacy is_primary + kind='talent_type' transparently.
      const taxonomy = (t.talent_profile_taxonomy ?? []) as ProfileTaxonomyRow[];
      const primary = extractPrimaryRoleTerm(taxonomy);
      const typeLabel = primary?.name_en ?? "Talent";

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
    name: (f as { name_i18n?: Record<string, string | null> | null }).name_i18n?.en ?? f.slug,
  }));

  // Count talent per location
  const locationData = locationsRes.data ?? [];
  const locationIds = locationData.map((l) => l.id);
  const locationCounts: Record<string, number> = {};
  // Map of locationId -> up to 10 talent IDs (featured first)
  const locationPreviewIds: Record<string, string[]> = {};

  if (locationIds.length > 0 && hasRoster) {
    const { data: countRows } = await supabase
      .from("talent_profiles")
      .select("id, residence_city_id, location_id, is_featured, featured_level")
      .in("id", rosterTalentIds)
      .eq("is_publicly_hidden", false)
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

  /**
   * Tenant scope: only surface cities where this tenant's roster actually has
   * talent. The `locations` table is global, so rendering the raw list would
   * leak peer tenants' cities (e.g. Impronta's Tulum/Cancún showing under
   * Midnight Muse). `hasRoster=false` → hide the whole section.
   */
  /**
   * Name + profile_code for the faces in the orbit ring. The ring lets a
   * visitor tap a face to get that talent's name and a link to their profile,
   * and neither is derivable from the media rows above -- those are keyed by
   * talent id and carry no identity. One extra query over ids we already have.
   */
  const previewIdentity: Record<string, { name: string | null; profileCode: string | null }> = {};
  if (allPreviewIds.length > 0) {
    const { data: previewProfiles } = await supabase
      .from("talent_profiles")
      .select("id, profile_code, display_name")
      .in("id", allPreviewIds)
      .eq("is_publicly_hidden", false)
      .is("deleted_at", null);
    for (const row of previewProfiles ?? []) {
      previewIdentity[row.id] = {
        name: row.display_name ?? null,
        profileCode: row.profile_code ?? null,
      };
    }
  }

  const locations: LocationItem[] = locationData
    .filter((l) => (locationCounts[l.id] ?? 0) > 0)
    .map((l) => {
      const dbLat = parseLocationCoord(l.latitude);
      const dbLng = parseLocationCoord(l.longitude);
      const resolved = resolveLocationMapCoordinates(l.city_slug, dbLat, dbLng);
      const previewIds = locationPreviewIds[l.id] ?? [];
      const featuredPreviews: LocationFeaturedPreview[] = previewIds.map((tid) => ({
        talentId: tid,
        thumbnailUrl: locationThumbnailMap[tid] ?? null,
        // A talent hidden from public listings drops out of `previewIdentity`
        // above, so it stays a faceless orbiting thumbnail with no name and no
        // link rather than becoming a way to reach a hidden profile.
        name: previewIdentity[tid]?.name ?? null,
        profileCode: previewIdentity[tid]?.profileCode ?? null,
      }));
      return {
        id: l.id,
        citySlug: l.city_slug,
        displayName: (l as { display_name_i18n?: Record<string, string | null> | null }).display_name_i18n?.en ?? l.city_slug,
        countryCode: l.country_code,
        talentCount: locationCounts[l.id] ?? 0,
        latitude: resolved?.lat ?? null,
        longitude: resolved?.lng ?? null,
        featuredPreviews,
      };
    });

  return { talentTypes, featuredTalent, fitLabels, locations };
}
