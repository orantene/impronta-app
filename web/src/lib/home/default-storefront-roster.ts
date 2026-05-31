/**
 * Default-storefront roster reader.
 *
 * Powers the data-driven *default* homepage body that an agency host shows
 * before its operator publishes a custom Page-Builder / CMS composition
 * (see `AgencyHomeStorefront` → `DefaultStorefrontBody`).
 *
 * This is deliberately NOT a return to the Phase-5-removed hardcoded
 * single-tenant marketing body. Everything here is keyed on the *current*
 * tenant's own published roster, so a brand-new workspace gets a branded,
 * populated homepage out of the box instead of an empty placeholder —
 * while never leaking one tenant's content onto another's surface.
 *
 * Reads only published/approved + active roster rows (public data), so the
 * service-role client is used purely to bypass per-row RLS while we apply
 * the explicit publish filter below.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type DefaultStorefrontTalent = {
  id: string;
  name: string;
  primaryTypeLabel: string | null;
  city: string | null;
  thumb: string | null;
};

/** Talent that may surface on a public default storefront. */
const PUBLISHED_STATUSES = new Set(["approved", "published"]);

const THUMB_VARIANT_RANK: Record<string, number> = {
  card: 0,
  public_watermarked: 1,
  gallery: 2,
  portfolio: 3,
  original: 4,
};

export async function loadDefaultStorefrontRoster(
  tenantId: string,
): Promise<DefaultStorefrontTalent[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("agency_talent_roster")
      .select(
        `
        status,
        talent_profile_id,
        talent_profiles!talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          workflow_status,
          home_city_text,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( name_en, term_type )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_en )
          )
        )
        `,
      )
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(24);

    if (error) {
      logServerError("home.defaultStorefront.loadRoster", error);
      return [];
    }

    type RawRow = {
      status: string;
      talent_profiles: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        workflow_status: string | null;
        home_city_text: string | null;
        talent_profile_taxonomy: Array<{
          relationship_type: string | null;
          taxonomy_terms: { name_en: string | null; term_type: string | null } | null;
        }> | null;
        talent_service_areas: Array<{
          service_kind: string | null;
          locations: { display_name_en: string | null } | null;
        }> | null;
      } | null;
    };

    const talentIds: string[] = [];
    const rows = (data ?? []) as unknown as RawRow[];
    const eligible: RawRow[] = [];

    for (const row of rows) {
      const p = row.talent_profiles;
      if (!p) continue;
      if (!PUBLISHED_STATUSES.has(p.workflow_status ?? "")) continue;
      eligible.push(row);
      talentIds.push(p.id);
    }

    // Batch-load card thumbnails — one query for all eligible talent.
    const thumbMap = new Map<string, string>();
    if (talentIds.length > 0) {
      const { data: mediaRows } = await sb
        .from("media_assets")
        .select("owner_talent_profile_id, storage_path, variant_kind")
        .in("owner_talent_profile_id", talentIds)
        .in("variant_kind", ["card", "public_watermarked", "gallery", "portfolio", "original"])
        .is("deleted_at", null);

      const bestRank = new Map<string, number>();
      for (const m of ((mediaRows ?? []) as Array<{
        owner_talent_profile_id: string;
        storage_path: string;
        variant_kind: string;
      }>)) {
        const rank = THUMB_VARIANT_RANK[m.variant_kind] ?? 99;
        const cur = bestRank.get(m.owner_talent_profile_id) ?? 99;
        if (rank < cur) {
          const { data: url } = sb.storage.from("media-public").getPublicUrl(m.storage_path);
          thumbMap.set(m.owner_talent_profile_id, url.publicUrl);
          bestRank.set(m.owner_talent_profile_id, rank);
        }
      }
    }

    return eligible.map((row) => {
      const p = row.talent_profiles!;
      const name =
        p.display_name?.trim() ||
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
        "Unnamed talent";

      const primaryTerm = (p.talent_profile_taxonomy ?? []).find(
        (term) =>
          (term.relationship_type === "primary_role" &&
            term.taxonomy_terms?.term_type === "talent_type") ||
          (term.relationship_type === "primary" &&
            term.taxonomy_terms?.term_type === "category"),
      );
      const primaryTypeLabel = primaryTerm?.taxonomy_terms?.name_en ?? null;

      const city =
        p.home_city_text?.trim() ||
        (p.talent_service_areas ?? []).find((a) => a.service_kind === "home_base")?.locations
          ?.display_name_en ||
        null;

      return {
        id: p.id,
        name,
        primaryTypeLabel: primaryTypeLabel ?? null,
        city: city ?? null,
        thumb: thumbMap.get(p.id) ?? null,
      };
    });
  } catch (err) {
    logServerError("home.defaultStorefront.loadRoster", err);
    return [];
  }
}
