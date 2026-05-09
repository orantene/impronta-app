import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScope } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";

// Re-export the workspace-level loaders so layout.tsx has a single import
// surface for all bridge data. The workspace bridge is tenant-id-explicit;
// the roster loader below is scope-implicit (calls getTenantScope() itself).
export {
  loadInquiriesForMessages,
  loadWorkspaceClients,
  loadCalendarEvents,
  loadWorkspaceOverviewMetrics,
  loadWorkspaceBookings,
  loadWorkspacePitches,
  loadWorkspaceTeamMembers,
  loadWorkspaceDomainSummary,
  loadWorkspaceBillingState,
  loadWebsiteData,
  loadTotalUnreadMessages,
  // Phase 3.12.2 — talent self-surface loaders
  loadTalentSelfProfile,
  loadTalentInquiries,
  loadTalentAgencies,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge";

// Media gallery + watermark bridge (Agency tier feature)
export {
  loadWorkspaceMediaPhotos,
  loadWorkspaceMediaBridge,
  type WorkspaceMediaPhoto,
  type WorkspaceMediaFolder,
  type WorkspaceMediaBridge,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge-media";

export type {
  WorkspaceInquiryForMessages,
  WorkspaceClientRow,
  CalendarEvent,
  WorkspaceOverviewMetrics,
  WorkspaceBookingRow,
  WorkspacePitchRow,
  WorkspaceTeamMember,
  WebsiteData,
  // Phase 3.12.2 — talent self-surface types
  TalentSelfProfile,
  TalentInquiryRow,
  TalentAgencyRow,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge";

// Type-only import. `_state.tsx` is a client module ("use client") and
// runtime-importing it from server code would defeat the whole point of
// the bridge. `import type` is erased at compile time and emits no JS,
// so we get the shape without pulling the client tree into server land.
import type { TalentProfile } from "./_state";
import type { WorkspaceMediaPhoto, WorkspaceMediaFolder } from "@/app/(workspace)/[tenantSlug]/_data-bridge-media";
import type {
  WorkspaceInquiryForMessages,
  WorkspaceClientRow,
  CalendarEvent,
  WorkspaceOverviewMetrics,
  WorkspaceBookingRow,
  WorkspacePitchRow,
  WorkspaceTeamMember,
  WebsiteData,
  TalentSelfProfile,
  TalentInquiryRow,
  TalentAgencyRow,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge";

/**
 * _data-bridge.ts — Phase 1 server-side bridge for the admin-shell prototype.
 *
 * Plan reference: `~/.claude/plans/ancient-gathering-sparkle.md` (Phase 1).
 * Task spec: `docs/handoffs/admin-shell-execution-task-package.md` Task P1.2.
 *
 * The prototype at `web/src/app/prototypes/admin-shell/*` is otherwise
 * 100% client-side mock. This module is the single doorway through which
 * live Impronta data enters the prototype tree. It runs on the server,
 * resolves the tenant scope from middleware-set headers + the user
 * session, queries Supabase under the user's RLS, and returns a payload
 * shaped exactly like the prototype's existing `TalentProfile` mock type.
 *
 * Contract:
 *   - Server-only ("server-only" guard above will throw if any client
 *     module imports this file at runtime).
 *   - No service-role key — every read goes through the SSR client tied
 *     to the user's auth cookie. RLS enforces tenant isolation at the
 *     database, not in this file.
 *   - No URL params, no cookie reads, no hardcoded fallback. Tenant
 *     resolution funnels through `getTenantScope()` only.
 *   - Returns `[]` when scope is null, the env is unconfigured, or the
 *     query fails. Never throws into the render path. Errors are logged
 *     server-side via `logServerError`.
 *
 * Schema decision (binding for Phase 1 forward — see task package P1.2):
 *   - `talent_profile_taxonomy` carries BOTH `is_primary BOOLEAN` (legacy
 *     2025 init) and `relationship_type TEXT` (v2 added in
 *     `20260801120100_taxonomy_v2_assignments_extend.sql`, CHECK +
 *     trigger validated, with unique index `ux_talent_profile_taxonomy_one_primary`
 *     enforcing one `primary_role` per profile). Phase 1 reads canonical
 *     v2: `relationship_type === 'primary_role'`.
 *   - `taxonomy_terms` carries BOTH `kind ENUM` (legacy) and
 *     `term_type TEXT NOT NULL` (v2 from
 *     `20260801120000_taxonomy_v2_hierarchy_columns.sql`). Phase 1 reads
 *     canonical v2: `term_type`.
 *   - `talent_service_areas` (migration `20260801120150` is live) is
 *     joined for `service_kind='home_base'` to derive the city label on
 *     roster cards.
 *
 * Phase 1 scope is **workspace roster only**. Other surfaces (talent,
 * client, platform) are mock-only until their own surface-specific
 * bridge functions land in Phase 3.
 */

export type BridgeData = {
  /**
   * Roster rows for the workspace surface. `null` means "live mode was
   * not requested — fall back to the per-plan mock arrays". An empty
   * array means "live mode was requested but the tenant has zero
   * rostered talent (or scope/query failed)" — the UI should render the
   * standard empty state, NOT silently swap in mock data.
   */
  roster: TalentProfile[] | null;

  // ── Phase 3.12 workspace real-data bridge fields ───────────────────────────
  /** Enriched inquiry rows for the Messages / Work surfaces. */
  inquiries: WorkspaceInquiryForMessages[] | null;
  /** Client rows for the Clients surface. */
  clients: WorkspaceClientRow[] | null;
  /** Calendar event rows (inquiries with non-null event_date). */
  calendarEvents: CalendarEvent[] | null;
  /** Overview page aggregate metrics. */
  overviewMetrics: WorkspaceOverviewMetrics | null;
  /** Recent bookings for the Bookings surface. */
  bookings: WorkspaceBookingRow[] | null;
  /** Phase 9 — pitch history rows for the Pitches surface. */
  pitches: WorkspacePitchRow[] | null;
  /** Team members for the Settings > Team surface. */
  teamMembers: WorkspaceTeamMember[] | null;
  /** Unread message count for the nav badge. */
  totalUnread: number;

  // ── Phase 3.12.2 talent self-surface bridge fields ─────────────────────────
  /**
   * The talent's own profile (display name, primary type, agency, profile code).
   * `null` when not in talent-surface canonical mode.
   */
  talentSelfProfile?: TalentSelfProfile | null;
  /**
   * The talent's active inquiries — adapted into `Conversation[]` by the
   * ProtoProvider adapter for use in TodayPage / InboxShell / CalendarPage.
   * `null` means talent surface is in mock mode (use MOCK_CONVERSATIONS).
   */
  talentInquiries?: TalentInquiryRow[] | null;
  /**
   * The talent's agency relationships — feeds the /talent/agencies page
   * and the talent identity bar's "Acting as <agency>" chip. `null` means
   * the layout didn't load this (e.g. workspace-only path) and the page
   * should fall back to MY_AGENCIES mocks in standalone prototype mode.
   */
  talentAgencies?: TalentAgencyRow[] | null;

  // ── Phase 5 — cross-mode unread counts for hybrid users ───────────────────
  /**
   * Unread message count scoped to the talent's personal inquiry threads.
   * Populated by admin/layout when isHybrid=true. undefined = no data (use 0).
   */
  talentUnread?: number;
  /**
   * Unread message count for workspace-scoped inquiries.
   * Populated by talent/layout when isHybrid=true. undefined = use totalUnread.
   */
  workspaceUnread?: number;

  // ── Phase 5 — user surface preference ──────────────────────────────────────
  /**
   * Persisted preferred surface from user_prefs. Null = no preference stored yet.
   * Used by ProtoProvider to set the initial surface (preferred > URL param > default).
   */
  preferredSurface?: "talent" | "workspace" | null;

  /**
   * Whether the user has seen the first-run toggle tip. When false and the
   * user is hybrid, a tooltip prompts them to try the mode toggle.
   */
  firstRunToggleTipSeen?: boolean;

  // ── Phase 0 (talent-surface launch readiness) — hybrid signal ──────────────
  /**
   * True when the signed-in user has BOTH a talent profile AND a workspace
   * membership in this tenant. Drives the `Talent | Workspace` mode toggle
   * in the prototype shell — the toggle is hidden for non-hybrid users.
   *
   * Derived server-side in the layout:
   *   - admin/layout.tsx: true when loadTalentSelfProfile() returns non-null
   *   - talent/layout.tsx: true when the user has any agency_memberships row
   *     in this tenant
   *
   * Defaults to `false` when the bridge is in standalone demo mode
   * (preserves the prototype's existing toggle visibility for design QA).
   */
  isHybrid?: boolean;

  // ── Phase 1 (master plan) — chrome identity bridge ────────────────────────
  /**
   * Real tenant identity for the workspace surface. When provided, the
   * prototype's chrome (top-bar workspace name, plan badge, domain
   * subline) reads from this instead of the hardcoded TENANT constant
   * in _state.tsx. `null` means the prototype runs in standalone demo
   * mode (e.g. /prototypes/admin-shell directly) and falls back to mocks.
   */
  tenantIdentity?: {
    tenantId: string;
    slug: string;
    displayName: string;
    planTier: string; // 'free' | 'studio' | 'agency' | 'network' (forwards-compat string)
    kind: string; // 'agency' | 'hub' | 'app' | 'marketing'
    /** Optional brand logo URL — replaces the TULALA wordmark in the
     *  identity bar when set. */
    logoUrl?: string | null;
  } | null;
  /**
   * Real signed-in user identity. When provided, the prototype's chrome
   * (top-bar acting label) reads from this instead of MY_TALENT_PROFILE.
   */
  sessionIdentity?: {
    userId: string;
    email: string;
    role: string; // membership role: 'owner' | 'admin' | 'coordinator' | etc.
    displayName: string | null;
  } | null;

  // ── Media gallery + watermark (Agency tier) ────────────────────────────────
  /**
   * Workspace media photos joined to roster talent. `null` means the
   * Media page falls back to MOCK_MEDIA. An empty array means "live mode
   * but no photos yet" — UI shows the empty state, NOT mock data.
   */
  mediaPhotos?: WorkspaceMediaPhoto[] | null;
  /** Workspace virtual folders. Empty array = live mode, no folders yet. */
  mediaFolders?: WorkspaceMediaFolder[];
};

export function createBridgeDataFromRoster(
  roster: TalentProfile[] | null,
): BridgeData {
  return {
    roster,
    inquiries: null,
    clients: null,
    calendarEvents: null,
    overviewMetrics: null,
    bookings: null,
    pitches: null,
    teamMembers: null,
    totalUnread: 0,
    talentSelfProfile: null,
    talentInquiries: null,
    talentAgencies: null,
  };
}

type RosterRow = {
  status: string;
  agency_visibility: string;
  talent_profile_id: string;
  created_at: string | null;
  talent_profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    workflow_status: string | null;
    height_cm: number | null;
    talent_profile_taxonomy:
      | {
          relationship_type: string | null;
          display_order: number | null;
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
          locations: {
            display_name_en: string | null;
            country_code: string | null;
          } | null;
        }[]
      | null;
    media_assets:
      | {
          storage_path: string;
          variant_kind: string | null;
          sort_order: number | null;
          deleted_at: string | null;
          approval_state: string | null;
          width: number | null;
          height: number | null;
        }[]
      | null;
  } | null;
};

/**
 * Pick the talent's representative thumb from a list of media_assets.
 *
 * Strategy (best → fallback):
 *   1. Prefer portrait or near-square aspect (height/width ≥ 1.0). Roster
 *      cards render as portraits — landscape banners look terrible cropped.
 *   2. Within portraits, prefer variant_kind in: card > gallery > original
 *      (skip 'banner' + 'public_watermarked' — those are landscape/decor).
 *   3. Within same variant, prefer lowest sort_order (talent-curated order).
 *   4. If NO portrait candidate exists, fall back to any non-banner asset
 *      sorted by variant_kind preference + sort_order.
 *
 * Filters out deleted + non-approved rows. Returns undefined if no usable
 * asset exists — roster card primitive handles that gracefully.
 */
function pickPrimaryThumb(
  assets: NonNullable<RosterRow["talent_profiles"]>["media_assets"],
): string | undefined {
  if (!assets || assets.length === 0) return undefined;
  const usable = assets.filter(
    (a) => !a.deleted_at && a.approval_state === "approved",
  );
  if (usable.length === 0) return undefined;

  // Skip banner + public_watermarked — they're never good roster card photos.
  const cardEligible = usable.filter(
    (a) =>
      a.variant_kind !== "public_watermarked" &&
      a.variant_kind !== "polaroid" &&
      a.variant_kind !== "reel",
  );

  // Prefer portraits/squares (height >= width) over landscapes.
  // We don't have a strict aspect-ratio threshold — height >= width covers
  // most real cases without rejecting square-ish portraits.
  const isPortrait = (a: { width?: number | null; height?: number | null }) =>
    typeof a.width === "number" &&
    typeof a.height === "number" &&
    a.width > 0 &&
    a.height >= a.width;

  const portraits = cardEligible.filter(isPortrait);

  // variant_kind ranking: card > gallery > original > others
  const variantRank = (kind: string | null) => {
    if (kind === "card") return 0;
    if (kind === "gallery") return 1;
    if (kind === "original") return 2;
    if (kind === "lightbox") return 3;
    return 4;
  };
  const sortByRank = <T extends { variant_kind?: string | null; sort_order?: number | null }>(arr: T[]) =>
    arr.sort((a, b) => {
      const r = variantRank(a.variant_kind ?? null) - variantRank(b.variant_kind ?? null);
      if (r !== 0) return r;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  // Pick from portraits first, fall back to any non-banner asset.
  const pool = portraits.length > 0 ? portraits : cardEligible;
  if (pool.length === 0) return undefined;
  sortByRank(pool);
  return pool[0]?.storage_path;
}

/**
 * Map Supabase roster + profile state into the prototype's
 * `TalentProfile["state"]` lifecycle. Conservative — anything we cannot
 * confidently classify falls to "draft" so a real talent never appears
 * "published" by accident.
 */
function deriveProfileState(row: RosterRow): TalentProfile["state"] {
  const rosterStatus = row.status;
  const profileWorkflow = row.talent_profiles?.workflow_status ?? null;

  if (rosterStatus === "pending") return "awaiting-approval";
  // DB uses 'approved' (not 'published') — both map to the "published" UI
  // state which means the talent is live and visible to clients.
  if (rosterStatus === "active" && (profileWorkflow === "approved" || profileWorkflow === "published")) {
    return "published";
  }
  if (profileWorkflow === "submitted" || profileWorkflow === "under_review") return "awaiting-approval";
  if (profileWorkflow === "draft") return "draft";
  if (profileWorkflow === "invited") return "invited";
  return "draft";
}

function deriveDisplayName(
  profile: NonNullable<RosterRow["talent_profiles"]>,
): string {
  if (profile.display_name && profile.display_name.trim()) {
    return profile.display_name.trim();
  }
  const first = profile.first_name?.trim() ?? "";
  const last = profile.last_name?.trim() ?? "";
  const joined = `${first} ${last}`.trim();
  return joined || "Unnamed talent";
}

/**
 * Read the talent's FEATURED skill slug for roster cards / search snippets.
 *
 * Multi-skill V1 (2026-05-07): a talent can have multiple primary_role rows
 * (up to 9 total skills). The "featured" skill = lowest display_order among
 * primary_role rows. Falls back to first secondary_role if no primary set.
 *
 * Returns the canonical slug. When the slug doesn't appear in TAXONOMY (DB
 * taxonomy was seeded independently, so slugs may diverge), the caller can
 * use this string directly as a display fallback via name_en.
 */
function derivePrimaryType(
  profile: NonNullable<RosterRow["talent_profiles"]>,
): string | undefined {
  const taxonomy = profile.talent_profile_taxonomy ?? [];
  if (taxonomy.length === 0) return undefined;

  // Helper: sort by display_order ASC (lower = featured), then by relationship.
  const ranked = [...taxonomy]
    .filter(
      (t) =>
        t.relationship_type === "primary_role" ||
        t.relationship_type === "secondary_role",
    )
    .sort((a, b) => {
      // Primary always before secondary
      if (a.relationship_type !== b.relationship_type) {
        return a.relationship_type === "primary_role" ? -1 : 1;
      }
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });

  const top = ranked[0]?.taxonomy_terms;
  // Fall back to name_en when slug is absent — card renderer shows it
  // directly when TAXONOMY.children.find(c => c.id === slug) returns null.
  return top?.slug ?? top?.name_en ?? undefined;
}

/**
 * Read the home base city label from `talent_service_areas`. A talent
 * may have multiple service areas (home_base, travel_to, remote_only);
 * we take the row whose `service_kind='home_base'`. Falls back to
 * `undefined` when no home base is set — the roster card primitive
 * renders gracefully without a city.
 */
function deriveCity(
  profile: NonNullable<RosterRow["talent_profiles"]>,
): string | undefined {
  const areas = profile.talent_service_areas ?? [];
  const home = areas.find((a) => a.service_kind === "home_base");
  return home?.locations?.display_name_en ?? undefined;
}

function deriveHeightLabel(profile: {
  height_cm: number | null;
}): string | undefined {
  if (profile.height_cm == null) return undefined;
  // Match the prototype mock format ("5'9\"") — Imperial labels are what
  // the design uses on roster cards. The bridge does the conversion so
  // every surface that reads this DTO sees a string identical in shape
  // to what the mock provides.
  const totalInches = Math.round(profile.height_cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

/**
 * Load the workspace roster for the currently-scoped tenant. Phase 1
 * Acceptance test: Impronta owner on `impronta.tulala.digital` should
 * see all 29 active+pending Impronta roster rows.
 *
 * Returns `[]` when:
 *   - No tenant scope is resolvable (anonymous, no membership, or
 *     stale cookie that doesn't match memberships).
 *   - Supabase env is not configured (createClient returns null).
 *   - The query throws (logged server-side).
 *
 * Never falls back to mock data — that decision lives in the client
 * shell, NOT the bridge. The bridge is a faithful "here is what live
 * data looks like" function.
 */
export async function loadWorkspaceRosterForCurrentTenant(): Promise<
  TalentProfile[]
> {
  try {
    const scope = await getTenantScope();
    if (!scope) return [];

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
          talent_profile_taxonomy (
            relationship_type,
            display_order,
            taxonomy_terms ( term_type, slug, name_en )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_en, country_code )
          ),
          media_assets (
            storage_path,
            variant_kind,
            sort_order,
            deleted_at,
            approval_state,
            width,
            height
          )
        )
        `,
      )
      .eq("tenant_id", scope.tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("admin-shell-prototype.loadWorkspaceRoster", error);
      return [];
    }

    const rows = (data ?? []) as unknown as RosterRow[];
    const out: TalentProfile[] = [];
    for (const row of rows) {
      const profile = row.talent_profiles;
      if (!profile) continue;
      // Phase 2 — wire the talent's primary headshot to the roster card.
      // Falls back to the deterministic tint+initial primitive when no
      // approved+non-deleted media exists.
      const thumbPath = pickPrimaryThumb(profile.media_assets);
      const thumbUrl = thumbPath
        ? supabase.storage.from("media-public").getPublicUrl(thumbPath).data
            .publicUrl
        : undefined;
      // Count portfolio-eligible photos (gallery + portfolio variants, excluding
      // soft-deleted rows). Computed from the same media_assets rows already
      // fetched above — no extra round-trip.
      const portfolioCount = (profile.media_assets ?? []).filter(
        (m) =>
          m.deleted_at == null &&
          m.variant_kind === "gallery",
      ).length;
      out.push({
        id: profile.id,
        name: deriveDisplayName(profile),
        state: deriveProfileState(row),
        height: deriveHeightLabel(profile),
        city: deriveCity(profile),
        thumb: thumbUrl,
        primaryType: derivePrimaryType(profile),
        portfolioCount,
        createdAt: row.created_at ?? undefined,
        // `completeness`, `availability`, `lastActive` are derived UI
        // hints not yet wired in the live schema. Leaving them undefined
        // is a valid `TalentProfile` and the existing roster card
        // primitives render their fallbacks for missing fields.
      });
    }
    return out;
  } catch (err) {
    logServerError("admin-shell-prototype.loadWorkspaceRoster", err);
    return [];
  }
}
