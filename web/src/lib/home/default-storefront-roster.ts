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

/**
 * Shared SELECT projection for an `agency_talent_roster` → `talent_profiles`
 * read. Kept in one place so the capped storefront read and the targeted by-id
 * portrait read stay byte-identical in shape (and therefore in the face they
 * resolve via `loadTalentCardThumbs`).
 */
const ROSTER_SELECT = `
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
        ` as const;

export async function loadDefaultStorefrontRoster(
  tenantId: string,
): Promise<DefaultStorefrontTalent[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("agency_talent_roster")
      .select(ROSTER_SELECT)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(24);

    if (error) {
      logServerError("home.defaultStorefront.loadRoster", error);
      return [];
    }

    return mapRosterRows(sb, data);
  } catch (err) {
    logServerError("home.defaultStorefront.loadRoster", err);
    return [];
  }
}

type RawRosterRow = {
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

/**
 * Shared eligibility filter + card-thumb backfill + row → DefaultStorefrontTalent
 * mapping, reused by the capped storefront read and the targeted by-id read so
 * both resolve the SAME face (ranks card > hero > public_watermarked > gallery >
 * original via loadTalentCardThumbs). The old inline copy once listed a
 * non-existent `portfolio` variant which made PostgREST reject the whole query
 * (every card fell to initials); the shared resolver is the canonical rank.
 */
async function mapRosterRows(
  sb: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  data: unknown,
): Promise<DefaultStorefrontTalent[]> {
  const talentIds: string[] = [];
  const rows = (data ?? []) as unknown as RawRosterRow[];
  const eligible: RawRosterRow[] = [];

  for (const row of rows) {
    const p = row.talent_profiles;
    if (!p) continue;
    if (!PUBLISHED_STATUSES.has(p.workflow_status ?? "")) continue;
    eligible.push(row);
    talentIds.push(p.id);
  }

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
}

/**
 * Targeted, UNCAPPED by-id roster portrait read for exactly the requested cart
 * talent ids. The capped `loadDefaultStorefrontRoster` (.limit(24)) drives the
 * default homepage body, where the 24-card cap is intentional — but the in-chat
 * launcher rail must resolve a face for EVERY cart member, including talents
 * beyond the first 24 or absent from that (active+ordered) storefront slice. This
 * filters `talent_profile_id IN (...)` for the given ids only (no .limit), still
 * tenant-scoped and gated by the same active-roster + published-workflow filters,
 * so it can never resolve cross-tenant or non-public talent. Ids not on this
 * tenant's public roster are simply omitted.
 */
export async function loadRosterPortraitsByIds(
  tenantId: string,
  talentProfileIds: string[],
): Promise<DefaultStorefrontTalent[]> {
  const ids = [...new Set((talentProfileIds ?? []).filter((x): x is string => !!x))];
  if (ids.length === 0) return [];
  const sb = createServiceRoleClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("agency_talent_roster")
      .select(ROSTER_SELECT)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("talent_profile_id", ids);

    if (error) {
      logServerError("home.defaultStorefront.loadPortraitsByIds", error);
      return [];
    }

    return mapRosterRows(sb, data);
  } catch (err) {
    logServerError("home.defaultStorefront.loadPortraitsByIds", err);
    return [];
  }
}
