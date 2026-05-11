import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

// Type-only import — `_state.tsx` is "use client"; import type is erased.
import type { TalentProfile } from "@/components/admin/shell/internal/state";

/**
 * _data-bridge/roster.ts — agency roster loaders + derive helpers.
 *
 * Split out of `_data-bridge.ts` (rev 13). All derive helpers are private
 * to this file (their only callers are the two roster loaders).
 */

// Mirror of prototype/_data-bridge.ts RosterRow — kept local to avoid
// coupling the workspace bridge to the prototype tree's internal types.
type RosterRow = {
  status: string;
  agency_visibility: string;
  talent_profile_id: string;
  talent_profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    workflow_status: string | null;
    height_cm: number | null;
    user_id: string | null;
    talent_profile_taxonomy:
      | {
          relationship_type: string | null;
          taxonomy_terms: {
            term_type: string | null;
            slug: string | null;
            name_en: string | null;
          } | null;
        }[]
      | null;
    talent_service_areas:
      | {
          service_kind: string | null;
          locations: { display_name_en: string | null; country_code: string | null } | null;
        }[]
      | null;
  } | null;
};

// ─── Enriched roster item (used by canonical workspace roster page) ───────────

export type WorkspaceRosterItem = {
  id: string;
  name: string;
  state: "published" | "draft" | "invited" | "awaiting-approval" | "claimed";
  primaryType?: string;        // taxonomy term slug
  primaryTypeLabel?: string;   // human-readable label from taxonomy_terms.name_en
  city?: string;
  height?: string;
  thumb?: string;
  /** ISO timestamp when this talent was added to the roster. Used for "Newest" sort. */
  addedAt?: string;
  /** talent_profiles.profile_code — used for public profile URL /t/<profileCode> */
  profileCode?: string | null;
  /** Invitation email stored on admin-created profiles before the talent claims their account. */
  invitationEmail?: string | null;
  /** 0..100 score across the 9-point profile completeness checklist (mirrors
   *  CompletenessDial.tsx in the edit page). Used for the per-card chip on
   *  the roster list so admins see at-a-glance which profiles need work. */
  completenessPercent?: number;
};

function deriveProfileState(row: RosterRow): TalentProfile["state"] {
  if (row.status === "pending") return "awaiting-approval";
  if (row.status === "active" && row.talent_profiles?.workflow_status === "published") {
    return "published";
  }
  // "Claimed" = talent has linked a user account to this profile.
  if (row.talent_profiles?.user_id) return "claimed";
  if (row.talent_profiles?.workflow_status === "invited") return "invited";
  if (row.talent_profiles?.workflow_status === "draft") return "draft";
  return "draft";
}

function deriveDisplayName(p: NonNullable<RosterRow["talent_profiles"]>): string {
  if (p.display_name?.trim()) return p.display_name.trim();
  const joined = `${p.first_name?.trim() ?? ""} ${p.last_name?.trim() ?? ""}`.trim();
  return joined || "Unnamed talent";
}

function derivePrimaryType(p: NonNullable<RosterRow["talent_profiles"]>): string | undefined {
  return (
    (p.talent_profile_taxonomy ?? [])
      .find((t) => t.relationship_type === "primary_role")
      ?.taxonomy_terms?.slug ?? undefined
  );
}

function derivePrimaryTypeLabel(p: NonNullable<RosterRow["talent_profiles"]>): string | undefined {
  return (
    (p.talent_profile_taxonomy ?? [])
      .find((t) => t.relationship_type === "primary_role")
      ?.taxonomy_terms?.name_en ?? undefined
  ) || undefined;
}

function deriveCity(p: NonNullable<RosterRow["talent_profiles"]>): string | undefined {
  return (
    (p.talent_service_areas ?? [])
      .find((a) => a.service_kind === "home_base")
      ?.locations?.display_name_en ?? undefined
  );
}

function deriveHeightLabel(p: { height_cm: number | null }): string | undefined {
  if (p.height_cm == null) return undefined;
  const totalInches = Math.round(p.height_cm / 2.54);
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
}

/**
 * Load the workspace roster for the given tenant. Explicit tenantId variant
 * of the prototype bridge — works correctly on the app host where tenant
 * scope comes from the URL slug, not the middleware header.
 *
 * Returns [] on error or empty roster. Never falls back to mock data.
 */
export async function loadWorkspaceRosterForTenant(
  tenantId: string,
): Promise<TalentProfile[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_talent_roster")
      .select(
        `
        status,
        agency_visibility,
        talent_profile_id,
        talent_profiles!talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          workflow_status,
          height_cm,
          user_id,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( term_type, slug, name_en )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_en, country_code )
          )
        )
        `,
      )
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("workspace.loadRosterForTenant", error);
      return [];
    }

    const rows = (data ?? []) as unknown as RosterRow[];
    const out: TalentProfile[] = [];
    for (const row of rows) {
      const profile = row.talent_profiles;
      if (!profile) continue;
      out.push({
        id: profile.id,
        name: deriveDisplayName(profile),
        state: deriveProfileState(row),
        height: deriveHeightLabel(profile),
        city: deriveCity(profile),
        primaryType: derivePrimaryType(profile),
      });
    }
    return out;
  } catch (err) {
    logServerError("workspace.loadRosterForTenant", err);
    return [];
  }
}

/**
 * Enriched roster for the canonical workspace roster page.
 * Same query as loadWorkspaceRosterForTenant but returns WorkspaceRosterItem[]
 * with primaryTypeLabel included (from taxonomy_terms.name_en).
 */
export async function loadWorkspaceRosterEnriched(
  tenantId: string,
): Promise<WorkspaceRosterItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_talent_roster")
      .select(
        `
        status,
        agency_visibility,
        talent_profile_id,
        created_at,
        talent_profiles!talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          workflow_status,
          height_cm,
          profile_code,
          invitation_email,
          home_city_text,
          short_bio,
          user_id,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( term_type, slug, name_en )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_en, country_code )
          )
        )
        `,
      )
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("workspace.loadRosterEnriched", error);
      return [];
    }

    const rows = (data ?? []) as unknown as (RosterRow & { created_at?: string })[];

    // Batch-load card avatars + portfolio counts + languages counts in
    // parallel for completeness scoring.
    const talentIds = rows
      .map((r) => r.talent_profiles?.id)
      .filter(Boolean) as string[];

    const thumbByTalentId = new Map<string, string>();
    const portfolioCountByTalentId = new Map<string, number>();
    const languagesCountByTalentId = new Map<string, number>();

    if (talentIds.length > 0) {
      const admin = createServiceRoleClient();
      const mediaClient = admin ?? supabase;

      const [mediaRes, portfolioRes, languagesRes] = await Promise.all([
        mediaClient
          .from("media_assets")
          .select("owner_talent_profile_id, storage_path, variant_kind")
          .in("owner_talent_profile_id", talentIds)
          .in("variant_kind", ["card", "public_watermarked", "gallery", "portfolio", "original"])
          .is("deleted_at", null),
        // Languages count per talent.
        supabase
          .from("talent_languages")
          .select("talent_profile_id")
          .in("talent_profile_id", talentIds),
        // Service areas already nested in main query — but languages aren't.
        Promise.resolve(null),
      ]);
      // (third slot reserved for parity; unused)
      void languagesRes;
      void portfolioRes;

      const BUCKET = "media-public";

      // Two-pass walk: prefer "card" thumb when present, else fall back to
      // the same chain the public talent page uses (public_watermarked →
      // gallery → portfolio → original). Reason: uploads land in different
      // variant_kinds depending on which surface saved them; the roster card
      // shouldn't go blank just because the talent only has a gallery shot.
      const THUMB_RANK: Record<string, number> = {
        card: 0,
        public_watermarked: 1,
        gallery: 2,
        portfolio: 3,
        original: 4,
      };
      const bestRankByTalent = new Map<string, number>();

      for (const m of ((mediaRes.data ?? []) as Array<{
        owner_talent_profile_id: string;
        storage_path: string;
        variant_kind: string;
      }>)) {
        // Update thumb if this row beats whatever we have so far.
        const rank = THUMB_RANK[m.variant_kind] ?? 99;
        const cur = bestRankByTalent.get(m.owner_talent_profile_id) ?? 99;
        if (rank < cur) {
          const { data: urlData } = mediaClient.storage.from(BUCKET).getPublicUrl(m.storage_path);
          thumbByTalentId.set(m.owner_talent_profile_id, urlData.publicUrl);
          bestRankByTalent.set(m.owner_talent_profile_id, rank);
        }
        // Portfolio count — anything in gallery / portfolio kinds.
        if (m.variant_kind === "portfolio" || m.variant_kind === "gallery") {
          portfolioCountByTalentId.set(
            m.owner_talent_profile_id,
            (portfolioCountByTalentId.get(m.owner_talent_profile_id) ?? 0) + 1,
          );
        }
      }

      // Re-execute languages query (the Promise.resolve above was a placeholder).
      const { data: langRows } = await supabase
        .from("talent_languages")
        .select("talent_profile_id")
        .in("talent_profile_id", talentIds);
      for (const l of ((langRows ?? []) as Array<{ talent_profile_id: string }>)) {
        languagesCountByTalentId.set(
          l.talent_profile_id,
          (languagesCountByTalentId.get(l.talent_profile_id) ?? 0) + 1,
        );
      }
    }

    const out: WorkspaceRosterItem[] = [];
    for (const row of rows) {
      const profile = row.talent_profiles;
      if (!profile) continue;
      const p = profile as typeof profile & {
        invitation_email?: string | null;
        home_city_text?: string | null;
        short_bio?: string | null;
      };
      const city = deriveCity(profile) ?? (p.home_city_text?.trim() || undefined);

      // ── 9-point completeness checklist (mirrors CompletenessDial.tsx) ──
      const taxonomy = (profile as {
        talent_profile_taxonomy?: Array<{ relationship_type: string }>;
      }).talent_profile_taxonomy ?? [];
      const areas = (profile as {
        talent_service_areas?: Array<{ service_kind: string }>;
      }).talent_service_areas ?? [];
      const hasName              = Boolean(deriveDisplayName(profile));
      const hasShortBio          = Boolean(p.short_bio?.trim());
      const hasPhoto             = Boolean(thumbByTalentId.get(profile.id));
      const hasPrimaryRole       = taxonomy.some((t) => t.relationship_type === "primary_role");
      const hasSecondaryDepth    = taxonomy.some(
        (t) =>
          t.relationship_type === "secondary_role" ||
          t.relationship_type === "skill"          ||
          t.relationship_type === "context"        ||
          t.relationship_type === "attribute",
      );
      const hasLanguage          = (languagesCountByTalentId.get(profile.id) ?? 0) > 0;
      const hasHomeCity          =
        Boolean(p.home_city_text?.trim()) ||
        areas.some((a) => a.service_kind === "home_base");
      const hasServiceArea       = areas.length > 0;
      const hasPortfolio         = (portfolioCountByTalentId.get(profile.id) ?? 0) > 0;
      // hasLongBio is Phase 3.13 — not counted yet.
      const filled =
        Number(hasName) +
        Number(hasShortBio) +
        Number(hasPhoto) +
        Number(hasPrimaryRole) +
        Number(hasSecondaryDepth) +
        Number(hasLanguage) +
        Number(hasHomeCity) +
        Number(hasServiceArea) +
        Number(hasPortfolio);
      const completenessPercent = Math.round((filled / 9) * 100);

      out.push({
        id: profile.id,
        name: deriveDisplayName(profile),
        state: deriveProfileState(row),
        height: deriveHeightLabel(profile),
        city,
        primaryType: derivePrimaryType(profile),
        primaryTypeLabel: derivePrimaryTypeLabel(profile),
        thumb: thumbByTalentId.get(profile.id),
        addedAt: row.created_at,
        profileCode: (profile as { profile_code?: string | null }).profile_code ?? null,
        invitationEmail: p.invitation_email ?? null,
        completenessPercent,
      });
    }
    return out;
  } catch (err) {
    logServerError("workspace.loadRosterEnriched", err);
    return [];
  }
}
