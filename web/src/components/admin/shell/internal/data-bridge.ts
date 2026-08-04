import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getTenantScope } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import {
  normalizeRosterCardBadges,
  type RosterCardBadgePrefs,
} from "@/lib/talent-cards/roster-card-badges";
import type { ProfileEditorLayout } from "@/lib/profile-editor/section-layout";
import type { ClientFieldSourcePayload } from "@/lib/field-engine/client-field-source-types";

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
  loadTalentInquiriesAllAgencies,
  loadTalentAgencies,
  // B.2 — user notifications backend
  loadUserNotifications,
  // B.3 — talent calendar (bookings + holds + availability_blocks)
  loadTalentCalendarEntries,
  loadRecentActivity,
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
  TalentInquiryAllAgenciesRow,
  TalentAgencyRow,
  // B.2 — user notifications backend
  UserNotification,
  // B.3 — talent calendar
  TalentCalendarEntry,
  TalentCalendarEntryKind,
  RecentActivityItem,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge";

// Type-only import. `_state.tsx` is a client module ("use client") and
// runtime-importing it from server code would defeat the whole point of
// the bridge. `import type` is erased at compile time and emits no JS,
// so we get the shape without pulling the client tree into server land.
import type { RosterTaxonomyChip, TalentProfile } from "./state";
import type { WorkspaceMediaPhoto, WorkspaceMediaFolder } from "@/app/(workspace)/[tenantSlug]/_data-bridge-media";
// Type-only — erased at compile time, so importing from the `"use server"`
// payouts actions module pulls no runtime JS (no server tree) into either
// this server-only file or the client context that re-uses the type.
import type { PayoutsSurfaceResult } from "@/app/(workspace)/[tenantSlug]/admin/payouts/payouts-surface-actions";
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
  UserNotification,
  TalentCalendarEntry,
  RecentActivityItem,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge";

/**
 * data-bridge.ts — server-side bridge for the canonical admin shell.
 *
 * Plan reference: `~/.claude/plans/ancient-gathering-sparkle.md` (Phase 1).
 * Task spec: `docs/handoffs/admin-shell-execution-task-package.md` Task P1.2.
 *
 * The shell is otherwise client-side state. This module is the single doorway
 * through which live Impronta data enters the admin shell. It runs on the server,
 * resolves the tenant scope from middleware-set headers + the user
 * session, queries Supabase under the user's RLS, and returns a payload
 * shaped exactly like the shell's existing `TalentProfile` type.
 *
 * Contract:
 *   - Server-only ("server-only" guard above will throw if any client
 *     module imports this file at runtime).
 *   - Reads go through the SSR client tied to the user's auth cookie, so
 *     RLS enforces tenant isolation at the database. The one exception is
 *     `loadWorkspaceRosterForCurrentTenant`, which self-elevates its read
 *     to the service-role client (RLS would otherwise NULL the embedded
 *     `talent_profiles` join for invited/hidden profiles); that read is
 *     gated by an upstream capability check + an explicit `tenant_id`
 *     filter — see the inline comment on that function.
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
  /** Recent workspace activity (real inquiry_events). null = mock mode; [] = live with no events yet. */
  recentActivity?: RecentActivityItem[] | null;
  /** B.2 — user notifications feed for the workspace surface drawer. */
  userNotifications?: UserNotification[] | null;
  /** B.3 — talent calendar entries (bookings + holds + blocks). null = mock mode. */
  talentCalendarEntries?: TalentCalendarEntry[] | null;
  /**
   * Phase D — talent earnings aggregated from commission snapshots. null = mock mode.
   * L49 (talent Money tabs): upgraded to `TalentEarningsByCurrency` so the Money
   * surface can render a per-currency tab strip when the talent has multi-currency
   * earnings. The bridge-derived `bridgeTalentEarnings` in the context continues to
   * expose the primary bundle as a plain `TalentEarnings` for backward-compat
   * consumers (IdentityBar KPI strip, useResolvedTalentEarnings fallback).
   */
  talentEarnings?: import("@/lib/talent/earnings-by-currency-types").TalentEarningsByCurrency | null;

  // ── Phase 3.12.2 talent self-surface bridge fields ─────────────────────────
  /**
   * The talent's own profile (display name, primary type, agency, profile code).
   * `null` when not in talent-surface canonical mode.
   */
  talentSelfProfile?: TalentSelfProfile | null;
  /**
   * The current talent's Stripe Connect payout snapshot, for the in-shell
   * Payouts section. `null` when not loaded (e.g. workspace-only entry).
   */
  talentPayoutSnapshot?:
    | { ok: true; data: import("@/lib/payments/stripe-connect-talent").TalentConnectedAccountSnapshot }
    | { ok: false; error: string }
    | null;
  /**
   * The current talent's HELD payout totals (earnings waiting on bank
   * connection), grouped by currency. Drives the payouts-page banner.
   */
  talentHeldPayouts?: Array<{ currency: string; amountCents: number; count: number }> | null;
  /**
   * The talent's active inquiries — adapted into `Conversation[]` by the
   * AdminShellProvider adapter for use in TodayPage / InboxShell / CalendarPage.
   * `null` means talent surface is in mock mode (use MOCK_CONVERSATIONS).
   */
  talentInquiries?: TalentInquiryRow[] | null;
  /**
   * The talent's agency relationships — feeds the /talent/money page
   * and the talent identity bar's "Acting as <agency>" chip. `null` means
   * the layout didn't load this (e.g. workspace-only path) and the page
   * should fall back to MY_AGENCIES mocks in standalone prototype mode.
   */
  talentAgencies?: TalentAgencyRow[] | null;
  /** Representation-drawer entries (self page + hub + agencies w/ effective visibility); null = not loaded. */
  talentRepresentation?: import("@/lib/talent/load-representation").RepresentationLoadResult | null;

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
   * Used by AdminShellProvider to set the initial surface (preferred > URL param > default).
   */
  preferredSurface?: "talent" | "workspace" | null;

  /**
   * Whether the user has seen the first-run toggle tip. When false and the
   * user is hybrid, a tooltip prompts them to try the mode toggle.
   */
  firstRunToggleTipSeen?: boolean;

  /**
   * W14 — whether the talent dismissed the Day-1 first-session checklist.
   * Persisted in user_prefs so the dismissal survives reloads.
   */
  talentChecklistDismissed?: boolean;

  // ── Phase 0 (talent-surface launch readiness) — hybrid signal ──────────────
  /**
   * True when the signed-in user has BOTH a talent profile AND a workspace
   * membership in this tenant. Drives the `Talent | Workspace` mode toggle
   * in the admin shell — the toggle is hidden for non-hybrid users.
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
   * mode and falls back to mocks.
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
    /** Whitelabel accent hex — injected as `--tulala-accent` on the shell
     *  root so the admin chrome adopts the agency's brand color. Only set
     *  for whitelabel-tier tenants; null/undefined = Tulala's forest green. */
    accentColor?: string | null;
    /**
     * Task 0.5 — The tenant's verified custom domain hostname, if any.
     * Populated from `agency_domains` where kind='custom' and
     * status IN ('verified', 'ssl_provisioned', 'active'). Null when
     * no custom domain is live yet. The Website settings TierCard reads
     * this to show "Live at <domain>" vs "Currently at <subdomain>"
     * without relying on the shell's plan-tier mock.
     */
    verifiedDomain?: string | null;
    /**
     * ISO timestamp set at provisioning when tier_interest='network'.
     * OverviewFree reads this to show the "Network setup pending" banner.
     */
    networkRequestedAt?: string | null;
  } | null;
  /**
   * Real signed-in user identity. When provided, the prototype's chrome
   * (top-bar acting label) reads from this instead of MY_TALENT_PROFILE.
   */
  sessionIdentity?: {
    userId: string;
    email: string;
    role: string; // membership role: 'owner' | 'admin' | 'manager' | etc.
    displayName: string | null;
    /**
     * True when the signed-in user holds a platform-level role
     * (`profiles.platform_role` / legacy `app_role = 'super_admin'`).
     * Drives the "Platform" entry point in the workspace switcher —
     * the platform console is not a tenant, so it can't surface via
     * `agency_memberships` like ordinary workspaces.
     */
    isPlatformAdmin?: boolean;
  } | null;

  // ── Media gallery + watermark (Agency tier) ────────────────────────────────
  /** Workspace media photos joined to roster talent. `null` = Media page falls
   * back to MOCK_MEDIA; empty array = "live mode, no photos yet" (empty state). */
  mediaPhotos?: WorkspaceMediaPhoto[] | null;
  /** Workspace virtual folders. Empty array = live mode, no folders yet. */
  mediaFolders?: WorkspaceMediaFolder[];
  /** True when the underlying media bridge query failed. */
  mediaBridgeErrored?: boolean;
  /** Total rows in the DB (may exceed mediaPhotos.length when capped). */
  mediaTotalCount?: number | null;

  /**
   * Live CMS / domain snapshot for the Website workspace surface.
   * `undefined` / omitted = standalone prototype (mock WEBSITE_STATE).
   * Empty `pages` arrays still mean "real tenant, zero pages" — not mock.
   */
  website?: WebsiteData | null;

  /**
   * Per-tenant roster-card badge visibility prefs (visibility eye, trust
   * marks, Discover pill, completeness, photo count, availability, TAL-ID).
   * Read from `agencies.settings.rosterCardBadges`. `null`/omitted = the
   * shell falls back to `DEFAULT_ROSTER_CARD_BADGES` (all visible).
   */
  rosterCardBadges?: RosterCardBadgePrefs | null;

  /**
   * Workspace Payouts surface payload (Stripe Connect snapshot + base-fee
   * state), pre-fetched server-side in the admin layout via
   * `loadPayoutsSurface`. `null`/omitted = the in-shell `PayoutsPage`
   * renders its "couldn't load payout settings" error card. The loader
   * already returns `{ ok: false }` on failure, so this never throws.
   */
  payoutsSurface?: PayoutsSurfaceResult | null;
  /** B0 — DB-backed profile-editor sidebar layout; falls back to hardcoded. */
  profileEditorLayout?: ProfileEditorLayout;
  // P1 — DB-resolved field source + flags; null = static (default).
  clientFieldSource?: ClientFieldSourcePayload | null;
  /** Tenant locale settings (loadTenantLocaleSettings) — drives the shell chrome's DashboardLocaleToggle so registry-added languages show; omitted = mock mode → ["en","es"]. */
  localeSettings?: { supportedLocales: readonly import("@/i18n/config").Locale[]; defaultLocale: import("@/i18n/config").Locale } | null;

  /**
   * Platform-wide workspace-UI switches (`platform_settings` singleton, set by
   * HQ on /platform/admin/settings). Gate the floating "+" quick-action button
   * (BottomActionFab) and the first-run guided tour. `null`/omitted = both
   * hidden (the platform default).
   */
  workspaceUi?: { fabEnabled: boolean; tourEnabled: boolean } | null;
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
    talentPayoutSnapshot: null,
    talentHeldPayouts: null,
    talentInquiries: null,
    talentAgencies: null,
    website: null,
  };
}

/**
 * Load the per-tenant roster-card badge prefs from
 * `agencies.settings.rosterCardBadges`. Read under the user's RLS via the SSR
 * client (staff-only row, owned by the workspace admin — no service-role).
 * Returns `null` on any failure; the shell falls back to the all-on default,
 * so a transient read failure never silently hides badges.
 */
export async function loadRosterCardBadges(
  explicitTenantId?: string,
): Promise<RosterCardBadgePrefs | null> {
  try {
    let tenantId = explicitTenantId ?? null;
    if (!tenantId) {
      const scope = await getTenantScope();
      if (!scope) return null;
      tenantId = scope.tenantId;
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data: agency, error } = await supabase
      .from("agencies")
      .select("settings")
      .eq("id", tenantId)
      .single();
    if (error) {
      logServerError("admin-shell-prototype.loadRosterCardBadges", error);
      return null;
    }

    const settings =
      typeof agency?.settings === "object" && agency.settings !== null
        ? (agency.settings as Record<string, unknown>)
        : {};
    return normalizeRosterCardBadges(settings.rosterCardBadges);
  } catch (err) {
    logServerError("admin-shell-prototype.loadRosterCardBadges", err);
    return null;
  }
}

type RosterRow = {
  status: string;
  agency_visibility: string;
  talent_profile_id: string;
  created_at: string | null;
  talent_profiles: {
    id: string;
    profile_code: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    invitation_email: string | null;
    workflow_status: string | null;
    is_publicly_hidden: boolean | null;
    height_cm: number | null;
    manual_rank_override: number | null;
    updated_at: string | null;
    talent_profile_taxonomy:
      | {
          relationship_type: string | null;
          display_order: number | null;
          taxonomy_terms: {
            id: string | null;
            parent_id: string | null;
            term_type: string | null;
            slug: string | null;
            name_i18n: Record<string, string | null> | null;
          } | null;
        }[]
      | null;
    talent_service_areas:
      | {
          service_kind: string | null;
          locations: {
            display_name_i18n: Record<string, string | null> | null;
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
 * Rank a talent's role terms for roster display: primary_role rows first
 * (lowest display_order = the featured skill), then secondary_role rows by
 * display_order. Multi-skill V1 (2026-05-07) allows several primary_role
 * rows, so "primary" = ranked[0] and everything after it renders as a
 * secondary chip.
 */
function rankRoleTerms(
  profile: NonNullable<RosterRow["talent_profiles"]>,
): NonNullable<
  NonNullable<RosterRow["talent_profiles"]>["talent_profile_taxonomy"]
> {
  return [...(profile.talent_profile_taxonomy ?? [])]
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
}

/**
 * Read the talent's FEATURED skill slug for roster cards / search snippets.
 *
 * Multi-skill V1 (2026-05-07): a talent can have multiple primary_role rows
 * (up to 9 total skills). The "featured" skill = lowest display_order among
 * primary_role rows. Falls back to first secondary_role if no primary set.
 * Returns the canonical slug; when it isn't in TAXONOMY the caller can use the
 * string directly as a display fallback via name_en.
 */
function derivePrimaryType(
  profile: NonNullable<RosterRow["talent_profiles"]>,
): string | undefined {
  const top = rankRoleTerms(profile)[0]?.taxonomy_terms;
  // Fall back to the English term name (name_i18n.en, WS4) when slug is absent —
  // card renderer shows it when TAXONOMY.children.find(c => c.id === slug) is null.
  return top?.slug ?? top?.name_i18n?.en ?? undefined;
}

// ── Roster category enrichment (labels, never slugs) ────────────────────────
//
// The admin roster card is internal tooling: staff must instantly see WHO a
// talent is. The DB tags talent at the taxonomy LEAF (`talent_type`, e.g.
// "fashion-model"), whose parent chain is category_group → parent_category
// ("Models"). The bridge rolls each talent's role terms up to display-ready
// chips — localized primary label, its parent-category label, secondary type
// labels — so the card never renders a raw slug and can differentiate a
// model-heavy roster by parent + secondaries.

/** Minimal taxonomy-tree row used to walk leaf → parent_category. */
type CategoryTreeRow = {
  id: string;
  parent_id: string | null;
  term_type: string | null;
  slug: string | null;
  name_i18n: Record<string, string | null> | null;
};

/** "cultural-dancer" → "Cultural Dancer" (last-resort label when name_i18n is empty). */
function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toTaxonomyChip(term: {
  slug: string | null;
  name_i18n: Record<string, string | null> | null;
}): RosterTaxonomyChip | undefined {
  const slug = term.slug?.trim();
  const labelEn = term.name_i18n?.en?.trim() || (slug ? titleCaseSlug(slug) : undefined);
  if (!slug || !labelEn) return undefined;
  const labelEs = term.name_i18n?.es?.trim() || undefined;
  return { slug, labelEn, ...(labelEs ? { labelEs } : {}) };
}

type BridgeReadClient =
  | NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>
  | NonNullable<ReturnType<typeof createServiceRoleClient>>;

/**
 * Load the category levels of the taxonomy tree (parent_category +
 * category_group — ~a few hundred rows, one page) so the roster loader can
 * walk each assigned leaf up to its parent_category. Leaf terms arrive
 * embedded on the roster rows (with `parent_id`), so they are not re-fetched.
 */
async function loadCategoryTreeById(
  client: BridgeReadClient,
): Promise<Map<string, CategoryTreeRow>> {
  const byId = new Map<string, CategoryTreeRow>();
  const { data, error } = await client
    .from("taxonomy_terms")
    .select("id, parent_id, term_type, slug, name_i18n")
    .in("term_type", ["parent_category", "category_group"]);
  if (error) {
    // Non-fatal: cards fall back to leaf labels without the parent strip.
    logServerError("admin-shell-prototype.loadCategoryTree", error);
    return byId;
  }
  for (const row of (data ?? []) as CategoryTreeRow[]) byId.set(row.id, row);
  return byId;
}

/** Walk up from a leaf's parent_id to its enclosing parent_category (≤ 5 hops). */
function parentCategoryOf(
  parentId: string | null,
  categoryById: Map<string, CategoryTreeRow>,
): CategoryTreeRow | undefined {
  let cur = parentId ? categoryById.get(parentId) : undefined;
  let hops = 0;
  while (cur && hops < 5) {
    if (cur.term_type === "parent_category") return cur;
    cur = cur.parent_id ? categoryById.get(cur.parent_id) : undefined;
    hops++;
  }
  return undefined;
}

/**
 * Derive the roster card's category chips for one talent: the featured
 * primary type, its parent category, and every remaining role term as a
 * secondary chip (display order preserved, de-duplicated by slug).
 */
function deriveTypeChips(
  profile: NonNullable<RosterRow["talent_profiles"]>,
  categoryById: Map<string, CategoryTreeRow>,
): {
  primaryTypeInfo?: RosterTaxonomyChip;
  parentCategory?: RosterTaxonomyChip;
  secondaryTypes?: RosterTaxonomyChip[];
} {
  const ranked = rankRoleTerms(profile);
  if (ranked.length === 0) return {};

  const primaryTerm = ranked[0]?.taxonomy_terms ?? null;
  const primaryTypeInfo = primaryTerm ? toTaxonomyChip(primaryTerm) : undefined;

  const parentTerm = primaryTerm
    ? parentCategoryOf(primaryTerm.parent_id, categoryById)
    : undefined;
  const parentCategory = parentTerm ? toTaxonomyChip(parentTerm) : undefined;

  const seen = new Set<string>(primaryTypeInfo ? [primaryTypeInfo.slug] : []);
  const secondaryTypes: RosterTaxonomyChip[] = [];
  for (const entry of ranked.slice(1)) {
    const chip = entry.taxonomy_terms ? toTaxonomyChip(entry.taxonomy_terms) : undefined;
    if (!chip || seen.has(chip.slug)) continue;
    seen.add(chip.slug);
    secondaryTypes.push(chip);
  }

  return {
    ...(primaryTypeInfo ? { primaryTypeInfo } : {}),
    ...(parentCategory ? { parentCategory } : {}),
    ...(secondaryTypes.length > 0 ? { secondaryTypes } : {}),
  };
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
  return home?.locations?.display_name_i18n?.en ?? undefined;
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
 * Load the workspace roster for a tenant. Phase 1 Acceptance test:
 * Impronta owner on `impronta.tulala.digital` should see all 29
 * active+pending Impronta roster rows.
 *
 * Tenant resolution: callers on `/{tenantSlug}/admin/*` routes MUST pass
 * the slug-resolved `tenantId` (every sibling loader in the admin layout
 * already does). Resolving the tenant from the cookie/header scope on a
 * slug-based route leaks the user's *default* tenant's roster into a
 * different workspace's UI — e.g. a hybrid talent who owns a second
 * workspace would see her agency's roster inside her own studio. The
 * no-arg fallback (cookie/header scope) is retained only for standalone
 * callers that have no slug context.
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
export async function loadWorkspaceRosterForCurrentTenant(
  explicitTenantId?: string,
): Promise<TalentProfile[]> {
  try {
    let tenantId = explicitTenantId ?? null;
    if (!tenantId) {
      const scope = await getTenantScope();
      if (!scope) return [];
      tenantId = scope.tenantId;
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Self-elevate the roster read to service-role. RLS on `talent_profiles`
    // only exposes profiles to non-owning actors once they are public —
    // an `invited` / `visibility:hidden` profile returns a NULL embed even
    // for the workspace's own admin. The `agency_talent_roster` row IS
    // visible under RLS, but the `talent_profiles!talent_profile_id` embed
    // collapses to null, so the `if (!profile) continue` below silently
    // drops every freshly-invited talent from the roster page.
    //
    // The actor is already gated upstream: the admin layout
    // (`[tenantSlug]/admin/layout.tsx`) verifies
    // `userHasCapability("agency.workspace.view", tenantId)` before this
    // loader runs, and the query below pins `.eq("tenant_id", tenantId)`.
    // Service-role + an explicit tenant filter = no cross-tenant leak.
    // Same precedent as the Discover roster read (commit b635cad6b) and
    // createOffer (85729cbc7) — the engine/UI gate auth, service-role
    // does the mechanical read. RLS stays as the secondary gate.
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
          profile_code,
          display_name,
          first_name,
          last_name,
          invitation_email,
          workflow_status,
          is_publicly_hidden,
          height_cm,
          manual_rank_override,
          updated_at,
          talent_profile_taxonomy (
            relationship_type,
            display_order,
            taxonomy_terms ( id, parent_id, term_type, slug, name_i18n )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_i18n, country_code )
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
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("admin-shell-prototype.loadWorkspaceRoster", error);
      return [];
    }

    const rows = (data ?? []) as unknown as RosterRow[];

    // Category-tree lookup for the leaf → parent_category walk. One small
    // query per roster load; failure degrades to cards without the parent
    // strip (never blocks the roster).
    const categoryById = await loadCategoryTreeById(readClient);

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
        profileCode: profile.profile_code ?? undefined,
        name: deriveDisplayName(profile),
        // Real-name + email identity for cards (Team drawer coordinator
        // picker etc.) — admins can't recognise talent from a stage name
        // alone. Optional: incomplete fixtures may have none of these.
        firstName: profile.first_name ?? undefined,
        lastName: profile.last_name ?? undefined,
        email: profile.invitation_email ?? undefined,
        state: deriveProfileState(row),
        height: deriveHeightLabel(profile),
        city: deriveCity(profile),
        thumb: thumbUrl,
        primaryType: derivePrimaryType(profile),
        // Display-ready category chips (localized labels, parent category,
        // secondaries) — the card must never render a raw slug.
        ...deriveTypeChips(profile, categoryById),
        portfolioCount,
        // Agency directory visibility — the roster-card eye toggle.
        siteVisible:
          row.agency_visibility === "site_visible" ||
          row.agency_visibility === "featured",
        // Talent's own global hide switch — overrides the agency eye.
        talentHidden: profile.is_publicly_hidden ?? false,
        // Curated "Recommended" rank (`talent_profiles.manual_rank_override`).
        // Drives the roster Arrange-order mode; null = not manually ranked.
        directoryRank: profile.manual_rank_override ?? undefined,
        createdAt: row.created_at ?? undefined,
        updatedAt: profile.updated_at ?? undefined,
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
