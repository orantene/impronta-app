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
import { loadTalentCardThumbs } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent-card-thumbs";

export type DefaultStorefrontTalent = {
  id: string;
  name: string;
  primaryTypeLabel: string | null;
  city: string | null;
  thumb: string | null;
};

/** Talent that may surface on a public default storefront. */
const PUBLISHED_STATUSES = new Set(["approved", "published"]);

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
            taxonomy_terms ( name_i18n, term_type )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_i18n )
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
          taxonomy_terms: { name_i18n: Record<string, string | null> | null; term_type: string | null } | null;
        }> | null;
        talent_service_areas: Array<{
          service_kind: string | null;
          locations: { display_name_i18n: Record<string, string | null> | null } | null;
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

    // Batch-load card thumbnails via the shared resolver so this default
    // storefront shows the SAME face as roster/discover (ranks card > hero >
    // public_watermarked > gallery > original). The old inline copy here listed
    // a non-existent `portfolio` variant — which made PostgREST reject the whole
    // query, so every card fell back to initials — and omitted the real `hero`.
    const thumbMap = await loadTalentCardThumbs(sb, talentIds);

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
      const primaryTypeLabel = primaryTerm?.taxonomy_terms?.name_i18n?.en ?? null;

      const city =
        p.home_city_text?.trim() ||
        (p.talent_service_areas ?? []).find((a) => a.service_kind === "home_base")?.locations
          ?.display_name_i18n?.en ||
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
