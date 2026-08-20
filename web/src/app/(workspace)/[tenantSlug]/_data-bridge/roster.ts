import "server-only";

import { cache } from "react";
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
    is_publicly_listed: boolean | null;
    deleted_at: string | null;
    height_cm: number | null;
    user_id: string | null;
    is_starter_seed: boolean | null;
    is_discoverable: boolean | null;
    talent_profile_taxonomy:
      | {
          relationship_type: string | null;
          taxonomy_terms: {
            term_type: string | null;
            slug: string | null;
            name_i18n: Record<string, string | null> | null;
          } | null;
        }[]
      | null;
    talent_service_areas:
      | {
          service_kind: string | null;
          locations: { display_name_i18n: Record<string, string | null> | null; country_code: string | null } | null;
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
  primaryTypeLabel?: string;   // human-readable label from taxonomy_terms.name_i18n.en
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
  /** Talent's master switch for cross-tenant Tulala Discover catalog. */
  isDiscoverable?: boolean;
  /** True for the demo profiles onboarding seeds (talent_profiles.is_starter_seed).
   *  Setup checklists must NOT count these as the operator's own talent. */
  isStarterSeed?: boolean;
};

function deriveProfileState(row: RosterRow): TalentProfile["state"] {
  if (row.status === "pending") return "awaiting-approval";
  // A publicly listed talent IS published, whatever the legacy lifecycle
  // column says. `is_publicly_listed` (20260803203521) is what the directory,
  // Discover and media RLS actually gate on, so the roster badge must agree —
  // this is what stopped cards reading DRAFT next to a green "visible" eye.
  if (row.status === "active" && row.talent_profiles?.is_publicly_listed === true) {
    return "published";
  }
  // Phase G fix (2026-05-14) — workflow_status='approved' is the canonical
  // production value; 'published' was the early-fixture literal. Both
  // count as "published" for surface gating (audit §A.1 #2). Without
  // this, Discover empty-stated despite 22+ approved+public talents
  // because every one of them fell through to 'draft'.
  if (
    row.status === "active"
    && (row.talent_profiles?.workflow_status === "approved"
        || row.talent_profiles?.workflow_status === "published")
  ) {
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
      ?.taxonomy_terms?.name_i18n?.en ?? undefined
  ) || undefined;
}

function deriveCity(p: NonNullable<RosterRow["talent_profiles"]>): string | undefined {
  return (
    (p.talent_service_areas ?? [])
      .find((a) => a.service_kind === "home_base")
      ?.locations?.display_name_i18n?.en ?? undefined
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
          is_publicly_listed,
          deleted_at,
          height_cm,
          user_id,
          is_starter_seed,
          is_discoverable,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( term_type, slug, name_i18n )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_i18n, country_code )
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
      // Soft-deleted profiles stay off the roster (see data-bridge.ts note).
      if (profile.deleted_at) continue;
      out.push({
        id: profile.id,
        name: deriveDisplayName(profile),
        state: deriveProfileState(row),
        isStarterSeed: profile.is_starter_seed ?? false,
        height: deriveHeightLabel(profile),
        city: deriveCity(profile),
        primaryType: derivePrimaryType(profile),
        isDiscoverable: profile.is_discoverable ?? false,
      });
    }
    return out;
  } catch (err) {
    logServerError("workspace.loadRosterForTenant", err);
    return [];
  }
}

/**
 * Lean roster loader for "+ New Inquiry" drawers across the client
 * dashboard. Returns ONLY the four fields the picker needs (id, name,
 * primaryTypeLabel, city). No media fetch, no signed URLs, no language
 * counts — those happen in loadWorkspaceRosterEnriched for the Discover
 * page.
 *
 * Audit finding 2026-05-14: loading the full enriched roster on every
 * client page (Today / Inquiries / Bookings / Discover) just to power a
 * drawer the user might never open caused the Today page to hang for
 * 17 minutes on first load. This loader fixes that.
 *
 * Wrapped in React `cache()` so if a shared layout and a child page both
 * call this with the same tenantId in one RSC render tree, the DB query
 * runs only once. Pure per-request read with no side effects.
 */
export type RosterLiteItem = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
};

export const loadWorkspaceRosterLite = cache(async function loadWorkspaceRosterLite(
  tenantId: string,
): Promise<RosterLiteItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Note: taxonomy join is LEFT (no !inner). Some talents are catalogued
    // via relationship_type='primary_role' + term_type='talent_type'
    // (production data) while older fixtures used 'primary' + 'category';
    // inner-joining on either pattern silently dropped talents that didn't
    // match. The picker chip shows the name regardless of category, so
    // missing label is acceptable but missing talent is not.
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
          home_city_text,
          workflow_status,
          user_id,
          is_starter_seed,
          deleted_at,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( term_type, name_i18n )
          )
        )
        `,
      )
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("workspace.loadRosterLite", error);
      return [];
    }

    type LiteRow = {
      status: string;
      agency_visibility: string;
      talent_profiles: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        home_city_text: string | null;
        workflow_status: string | null;
        user_id: string | null;
        is_starter_seed: boolean | null;
        deleted_at: string | null;
        talent_profile_taxonomy:
          | Array<{
              relationship_type: string | null;
              taxonomy_terms: { term_type: string | null; name_i18n: Record<string, string | null> | null } | null;
            }>
          | null;
      } | null;
    };

    const out: RosterLiteItem[] = [];
    for (const row of ((data ?? []) as unknown as LiteRow[])) {
      const p = row.talent_profiles;
      if (!p) continue;
      if (p.deleted_at) continue;
      if (p.workflow_status === "rejected") continue;
      const name =
        p.display_name?.trim()
        || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()
        || "Unnamed talent";
      // Accept both schemas: the canonical 'primary_role' + 'talent_type'
      // pattern from production seeding, and the older 'primary' + 'category'
      // pattern from earlier fixtures. First match wins.
      const primaryRel = p.talent_profile_taxonomy?.find(
        (t) =>
          (t.relationship_type === "primary_role"
            && t.taxonomy_terms?.term_type === "talent_type")
          || (t.relationship_type === "primary"
            && t.taxonomy_terms?.term_type === "category"),
      );
      const primaryTypeLabel = primaryRel?.taxonomy_terms?.name_i18n?.en ?? undefined;
      const city = p.home_city_text?.trim() || undefined;
      out.push({ id: p.id, name, primaryTypeLabel, city });
    }
    return out;
  } catch (err) {
    logServerError("workspace.loadRosterLite", err);
    return [];
  }
});

/**
 * Enriched roster for the canonical workspace roster page.
 * Same query as loadWorkspaceRosterForTenant but returns WorkspaceRosterItem[]
 * with primaryTypeLabel included (from taxonomy_terms.name_i18n.en).
 */
export async function loadWorkspaceRosterEnriched(
  tenantId: string,
): Promise<WorkspaceRosterItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Phase G fix (2026-05-14) — self-elevate the agency_talent_roster
    // read to service-role. RLS on this table only exposes rows with
    // agency_visibility IN ('site_visible', 'featured') to non-staff
    // actors via the public policy. But the vast majority of seeded
    // roster rows are 'roster_only' — visible to staff but not to the
    // public, EVEN for the agency's own clients. That meant the client
    // Discover page showed "Roster coming soon" despite 27 active
    // approved talents being on impronta's roster.
    //
    // Callers gate the actor (e.g. the Discover page requires a
    // client_profiles row in this tenant via loadClientSelfProfile)
    // before invoking this loader; service-role for the read is safe.
    // Same pattern as createOffer (commit 85729cbc7) +
    // createInquiryFromIntent (Phase B-3) + loadClientInquiryDetails
    // (Phase C). RLS stays as the second gate; the engine is the first.
    const admin = createServiceRoleClient();
    const readClient = admin ?? supabase;

    const { data, error } = await readClient
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
          is_starter_seed,
          deleted_at,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( term_type, slug, name_i18n )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_i18n, country_code )
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
          // Face variants — real media_variant_kind enum values only. Adds the
          // valid `hero` cover (was missing → hero-only talents went blank) and
          // drops the non-existent `portfolio`. Matches the shared resolver
          // (talent-card-thumbs.ts). The portfolio/gallery COUNT loop below is
          // why this surface keeps its own query rather than delegating.
          .in("variant_kind", ["card", "hero", "public_watermarked", "gallery", "original"])
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
        hero: 1,
        public_watermarked: 2,
        gallery: 3,
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
      if (profile.deleted_at) continue;
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
        isStarterSeed: profile.is_starter_seed ?? false,
        height: deriveHeightLabel(profile),
        city,
        primaryType: derivePrimaryType(profile),
        primaryTypeLabel: derivePrimaryTypeLabel(profile),
        thumb: thumbByTalentId.get(profile.id),
        addedAt: row.created_at,
        profileCode: (profile as { profile_code?: string | null }).profile_code ?? null,
        invitationEmail: p.invitation_email ?? null,
        completenessPercent,
        isDiscoverable: profile.is_discoverable ?? false,
      });
    }
    return out;
  } catch (err) {
    logServerError("workspace.loadRosterEnriched", err);
    return [];
  }
}
