import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { loadClientTrustStatesForTenant } from "@/lib/client-trust/evaluator";

// Type-only import — `_state.tsx` is "use client"; import type is erased.
import type { TalentProfile } from "@/app/prototypes/admin-shell/_state";

// Site-admin helpers used by loadWebsiteData.
import { listPagesForStaff } from "@/lib/site-admin/server/pages-reads";
import { loadIdentityForStaff } from "@/lib/site-admin/server/reads";
import { getTenantPreviewOrigin } from "@/lib/site-admin/server/tenant-hosts";

/**
 * _data-bridge.ts — Phase 3 workspace server-side data bridge.
 *
 * Provides tenant-id-explicit data loaders for the canonical workspace
 * routes at `(workspace)/[tenantSlug]/*`. Unlike the existing dashboard
 * loaders (which call `getTenantScope()` internally), these functions
 * accept an explicit `tenantId` so they work correctly on the app host
 * where tenant resolution comes from the URL slug, not the host header
 * or active-tenant cookie.
 *
 * Every function here is server-only, uses the SSR client (user RLS), and
 * never falls back to mock data. Empty/null returns are safe states — the
 * route renders gracefully without them.
 */

// ─── Overview metrics ────────────────────────────────────────────────────────

export type WorkspaceOverviewMetrics = {
  /** Total rostered talent (status != removed). */
  rosterTotal: number;
  /** Rostered talent with workflow_status = 'published' and roster status = 'active'. */
  rosterPublished: number;
  /** Active open inquiries (status IN ('submitted','coordination','offer_pending','approved')). */
  openInquiries: number;
  /** Active workspace members (agency_memberships.status = 'active'). */
  teamMembers: number;
  /** Roster rows with status = 'pending' — talent awaiting agency approval. */
  pendingApprovals: number;
  /** Inquiries waiting for client decision (next_action_by = 'client'). */
  awaitingClientCount: number;
  /** Inquiries in draft state. */
  draftInquiryCount: number;
};

export async function loadWorkspaceOverviewMetrics(
  tenantId: string,
): Promise<WorkspaceOverviewMetrics | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const [rosterRes, openInquiriesRes, teamRes, pendingRes, awaitingClientRes, draftInqRes] = await Promise.all([
      // Roster: total + published count
      supabase
        .from("agency_talent_roster")
        .select(
          "status, talent_profiles!talent_profile_id ( workflow_status )",
          { count: "exact", head: false },
        )
        .eq("tenant_id", tenantId)
        .neq("status", "removed"),

      // Open inquiries
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["submitted", "coordination", "offer_pending", "approved"]),

      // Active team members
      supabase
        .from("agency_memberships")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active"),

      // Pending approvals
      supabase
        .from("agency_talent_roster")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),

      // Inquiries awaiting client decision
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("next_action_by", "client"),

      // Draft inquiries
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["draft"]),
    ]);

    if (rosterRes.error) {
      logServerError("workspace.loadOverviewMetrics.roster", rosterRes.error);
    }
    if (openInquiriesRes.error) {
      logServerError("workspace.loadOverviewMetrics.inquiries", openInquiriesRes.error);
    }
    if (teamRes.error) {
      logServerError("workspace.loadOverviewMetrics.team", teamRes.error);
    }
    if (pendingRes.error) {
      logServerError("workspace.loadOverviewMetrics.pending", pendingRes.error);
    }

    type RosterRow = {
      status: string;
      talent_profiles: { workflow_status: string | null } | null;
    };

    const rosterRows = ((rosterRes.data ?? []) as unknown as RosterRow[]);
    const rosterTotal = rosterRows.length;
    const rosterPublished = rosterRows.filter(
      (r) => r.status === "active" && r.talent_profiles?.workflow_status === "published",
    ).length;

    return {
      rosterTotal,
      rosterPublished,
      openInquiries: openInquiriesRes.count ?? 0,
      teamMembers: teamRes.count ?? 0,
      pendingApprovals: pendingRes.count ?? 0,
      awaitingClientCount: awaitingClientRes.count ?? 0,
      draftInquiryCount: draftInqRes.count ?? 0,
    };
  } catch (err) {
    logServerError("workspace.loadOverviewMetrics", err);
    return null;
  }
}

// ─── Roster ──────────────────────────────────────────────────────────────────

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
};

function deriveProfileState(row: RosterRow): TalentProfile["state"] {
  if (row.status === "pending") return "awaiting-approval";
  if (row.status === "active" && row.talent_profiles?.workflow_status === "published") {
    return "published";
  }
  if (row.talent_profiles?.workflow_status === "draft") return "draft";
  if (row.talent_profiles?.workflow_status === "invited") return "invited";
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
        talent_profiles!talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          workflow_status,
          height_cm,
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

    const rows = (data ?? []) as unknown as RosterRow[];
    const out: WorkspaceRosterItem[] = [];
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
        primaryTypeLabel: derivePrimaryTypeLabel(profile),
      });
    }
    return out;
  } catch (err) {
    logServerError("workspace.loadRosterEnriched", err);
    return [];
  }
}

// ─── Work / Inquiries ────────────────────────────────────────────────────────

/** Terminal statuses excluded from the open Work queue. */
const INQUIRY_CLOSED_STATUSES = [
  "booked",
  "rejected",
  "expired",
  "closed_lost",
  "archived",
  "converted", // legacy alias for booked
  "closed",    // legacy alias for closed_lost
] as const;

export type WorkspaceInquiryRow = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  created_at: string;
  /** next_action_by value: 'admin' | 'coordinator' | 'client' | 'talent' | null */
  next_action_by: string | null;
};

/**
 * Load open inquiries for the Work page. Returns inquiries excluding terminal
 * statuses, ordered by recency (newest first). Capped at 200 rows — the Work
 * page is a live queue view, not a full archive.
 *
 * Returns [] on error or empty queue. Never falls back to mock data.
 */
export async function loadWorkspaceInquiries(
  tenantId: string,
): Promise<WorkspaceInquiryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select(
        "id, status, contact_name, company, event_date, event_location, quantity, created_at, next_action_by",
      )
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("workspace.loadInquiries", error);
      return [];
    }

    return (data ?? []) as WorkspaceInquiryRow[];
  } catch (err) {
    logServerError("workspace.loadInquiries", err);
    return [];
  }
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export type WorkspaceClientRow = {
  /** user_id from auth */
  id: string;
  /** Display name from profiles table */
  name: string;
  /** Company / business name from client_profiles */
  company: string | null;
  /** Account status from profiles (registered / active / suspended) */
  accountStatus: string | null;
  /** Total inquiries submitted to this tenant */
  inquiryCount: number;
  /** Confirmed bookings (status in booked/converted) in the current calendar year */
  bookingsYTD: number;
  /** Phase 3.7 — client trust tier for this tenant. null = no trust record (equivalent to basic). */
  trustLevel: "basic" | "verified" | "silver" | "gold" | null;
};

/**
 * Load the client list for a tenant. Scoped via inquiries.client_user_id —
 * only returns clients who have placed at least one inquiry with this tenant.
 * Ordered by most-recent-inquiry descending.
 *
 * Returns [] on error. Never falls back to mock data.
 */
export async function loadWorkspaceClients(
  tenantId: string,
): Promise<WorkspaceClientRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Step 1: Get all inquiries for this tenant — count all + booked YTD per client.
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const { data: inquiryAggRows, error: inquiryErr } = await supabase
      .from("inquiries")
      .select("client_user_id, created_at, status")
      .eq("tenant_id", tenantId)
      .not("client_user_id", "is", null)
      .order("created_at", { ascending: false });

    if (inquiryErr) {
      logServerError("workspace.loadClients.inquiries", inquiryErr);
      return [];
    }

    // Aggregate: total inquiries, bookings YTD, latest activity per client
    const clientStats = new Map<string, { count: number; bookingsYTD: number; latestAt: string }>();
    for (const row of inquiryAggRows ?? []) {
      const uid = (row as { client_user_id: string | null }).client_user_id;
      if (!uid) continue;
      const createdAt = (row as { created_at: string }).created_at;
      const status = (row as { status: string | null }).status;
      const isBookedThisYear =
        (status === "booked" || status === "converted") &&
        createdAt >= yearStart;
      const existing = clientStats.get(uid);
      if (!existing) {
        clientStats.set(uid, { count: 1, bookingsYTD: isBookedThisYear ? 1 : 0, latestAt: createdAt });
      } else {
        clientStats.set(uid, {
          count: existing.count + 1,
          bookingsYTD: existing.bookingsYTD + (isBookedThisYear ? 1 : 0),
          latestAt: existing.latestAt,
        });
      }
    }

    const userIds = [...clientStats.keys()];
    if (userIds.length === 0) return [];

    // Step 2: Fetch client_profiles + profiles + trust states in parallel.
    const [profileResult, trustMap] = await Promise.all([
      supabase
        .from("client_profiles")
        .select("user_id, company_name, profiles!inner(display_name, account_status)")
        .in("user_id", userIds),
      loadClientTrustStatesForTenant(userIds, tenantId, supabase),
    ]);

    const { data: profileRows, error: profileErr } = profileResult;

    if (profileErr) {
      logServerError("workspace.loadClients.profiles", profileErr);
      return [];
    }

    type ClientProfileRow = {
      user_id: string;
      company_name: string | null;
      profiles:
        | { display_name: string | null; account_status: string | null }
        | { display_name: string | null; account_status: string | null }[]
        | null;
    };

    const profileByUserId = new Map<string, ClientProfileRow>();
    for (const row of (profileRows ?? []) as unknown as ClientProfileRow[]) {
      profileByUserId.set(row.user_id, row);
    }

    // Step 3: Assemble output, sorted by most-recent inquiry desc
    const out: WorkspaceClientRow[] = [];
    const sorted = [...clientStats.entries()].sort(
      ([, a], [, b]) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    );

    for (const [uid, stats] of sorted) {
      const row = profileByUserId.get(uid);
      const profileJoin = row?.profiles;
      const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;
      const name = profile?.display_name?.trim() || uid.slice(0, 8);
      out.push({
        id: uid,
        name,
        company: row?.company_name ?? null,
        accountStatus: profile?.account_status ?? null,
        inquiryCount: stats.count,
        bookingsYTD: stats.bookingsYTD,
        // Phase 3.7 — trust level from client_trust_state; null if no record yet.
        trustLevel: trustMap.get(uid) ?? null,
      });
    }

    return out;
  } catch (err) {
    logServerError("workspace.loadClients", err);
    return [];
  }
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export type WorkspaceBookingRow = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  created_at: string;
};

/**
 * Load confirmed bookings for a tenant. Booked = status IN ('booked',
 * 'converted'). Ordered by event_date ascending so the next upcoming job
 * is first; null dates sort last.
 *
 * Returns [] on error. Never falls back to mock data.
 */
export async function loadWorkspaceBookings(
  tenantId: string,
): Promise<WorkspaceBookingRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select(
        "id, contact_name, company, event_date, event_location, quantity, created_at",
      )
      .eq("tenant_id", tenantId)
      .in("status", ["booked", "converted"])
      .order("event_date", { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) {
      logServerError("workspace.loadBookings", error);
      return [];
    }

    return (data ?? []) as WorkspaceBookingRow[];
  } catch (err) {
    logServerError("workspace.loadBookings", err);
    return [];
  }
}

// ─── Agency summary ───────────────────────────────────────────────────────────

/** Valid workspace plan tiers — mirrors WorkspacePlan from admin-workspace-summary. */
export type WorkspacePlan = "free" | "studio" | "agency" | "network";

const VALID_WORKSPACE_PLANS = new Set<string>(["free", "studio", "agency", "network"]);

function coercePlan(raw: unknown): WorkspacePlan {
  if (typeof raw === "string" && VALID_WORKSPACE_PLANS.has(raw)) {
    return raw as WorkspacePlan;
  }
  return "free";
}

export type WorkspaceAgencySummary = {
  displayName: string;
  slug: string;
  plan: WorkspacePlan;
  /** Null = unlimited (Network plan). */
  talentLimit: number | null;
  talentCount: number;
  contactEmail: string | null;
  contactPhone: string | null;
  addressCity: string | null;
  addressCountry: string | null;
};

/**
 * Tenant-id-explicit workspace summary. Used by the Account page on the app
 * host where tenant scope comes from the URL slug, not the active-tenant
 * cookie.
 *
 * Returns null on error or missing data.
 */
export async function loadWorkspaceAgencySummary(
  tenantId: string,
): Promise<WorkspaceAgencySummary | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const [agencyRes, identityRes, rosterCountRes] = await Promise.all([
      supabase
        .from("agencies")
        .select("slug, display_name, plan_tier, talent_seat_limit")
        .eq("id", tenantId)
        .maybeSingle(),
      supabase
        .from("agency_business_identity")
        .select("contact_email, contact_phone, address_city, address_country")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("agency_talent_roster")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .neq("status", "removed"),
    ]);

    if (agencyRes.error) {
      logServerError("workspace.loadAgencySummary.agency", agencyRes.error);
    }

    if (!agencyRes.data) return null;

    const row = agencyRes.data as {
      slug: string;
      display_name: string;
      plan_tier: string | null;
      talent_seat_limit: number | null;
    };
    const identity = identityRes.data as {
      contact_email: string | null;
      contact_phone: string | null;
      address_city: string | null;
      address_country: string | null;
    } | null;

    return {
      displayName: row.display_name,
      slug: row.slug,
      plan: coercePlan(row.plan_tier),
      talentLimit: row.talent_seat_limit,
      talentCount: rosterCountRes.count ?? 0,
      contactEmail: identity?.contact_email ?? null,
      contactPhone: identity?.contact_phone ?? null,
      addressCity: identity?.address_city ?? null,
      addressCountry: identity?.address_country ?? null,
    };
  } catch (err) {
    logServerError("workspace.loadAgencySummary", err);
    return null;
  }
}

// ─── Team members ─────────────────────────────────────────────────────────────

export type WorkspaceTeamMember = {
  /** profile_id from agency_memberships */
  id: string;
  name: string;
  /** Membership role: viewer | editor | coordinator | admin | owner */
  role: string;
  /** Membership status: active | pending_acceptance */
  status: string;
  /** ISO timestamp when the membership was accepted or created */
  joinedAt: string | null;
};

/**
 * Load active + pending team members for a workspace.
 * Ordered by role rank desc (owner first), then by join date asc.
 *
 * Returns [] on error. Never falls back to mock data.
 */
export async function loadWorkspaceTeamMembers(
  tenantId: string,
): Promise<WorkspaceTeamMember[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_memberships")
      .select(
        "profile_id, role, status, accepted_at, created_at, profiles:profile_id(display_name)",
      )
      .eq("tenant_id", tenantId)
      .in("status", ["active", "pending_acceptance"])
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("workspace.loadTeamMembers", error);
      return [];
    }

    type MemberRow = {
      profile_id: string;
      role: string;
      status: string;
      accepted_at: string | null;
      created_at: string;
      profiles:
        | { display_name: string | null }
        | { display_name: string | null }[]
        | null;
    };

    const ROLE_RANK: Record<string, number> = {
      owner: 4,
      admin: 3,
      coordinator: 2,
      editor: 1,
      viewer: 0,
    };

    const rows = (data ?? []) as unknown as MemberRow[];
    const out: WorkspaceTeamMember[] = rows.map((row) => {
      const profileJoin = row.profiles;
      const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;
      const name = profile?.display_name?.trim() || row.profile_id.slice(0, 8);
      return {
        id: row.profile_id,
        name,
        role: row.role,
        status: row.status,
        joinedAt: row.accepted_at ?? row.created_at,
      };
    });

    // Sort: higher rank first, then by joinedAt asc
    out.sort((a, b) => {
      const ra = ROLE_RANK[a.role] ?? -1;
      const rb = ROLE_RANK[b.role] ?? -1;
      if (ra !== rb) return rb - ra;
      return new Date(a.joinedAt ?? 0).getTime() - new Date(b.joinedAt ?? 0).getTime();
    });

    return out;
  } catch (err) {
    logServerError("workspace.loadTeamMembers", err);
    return [];
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────
//
// The inquiry_messages table uses:
//   inquiry_id  uuid
//   thread_type inquiry_thread_type  ('private' = client thread, 'group' = talent thread)
//   sender_user_id uuid
//   body text
//   created_at timestamptz
//   tenant_id uuid
//
// inquiry_message_reads tracks (inquiry_id, thread_type, user_id, last_read_at).

export type ThreadType = "private" | "group";

export type WorkspaceMessage = {
  id: string;
  sender_user_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  is_mine: boolean;
};

export type WorkspaceInquiryForMessages = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  created_at: string;
  next_action_by: string | null;
  /** Total unread messages across both threads for the current user. */
  unread_count: number;
};

/**
 * Load all non-terminal inquiries for the Messages inbox.
 * Includes unread counts from inquiry_message_reads for the current user.
 */
export async function loadInquiriesForMessages(
  tenantId: string,
): Promise<WorkspaceInquiryForMessages[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Get current user id for unread counting
    const { data: { user } } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;

    const [inquiryRes, readsRes] = await Promise.all([
      supabase
        .from("inquiries")
        .select("id, status, contact_name, company, event_date, event_location, quantity, created_at, next_action_by")
        .eq("tenant_id", tenantId)
        .not("status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(200),

      myUserId ? supabase
        .from("inquiry_message_reads")
        .select("inquiry_id, thread_type, last_read_message_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", myUserId) : Promise.resolve({ data: [], error: null }),
    ]);

    if (inquiryRes.error) {
      logServerError("workspace.loadInquiriesForMessages.inquiries", inquiryRes.error);
      return [];
    }

    // Count unread per inquiry (rough signal: no read receipt = unread)
    const readMap = new Map<string, Set<string>>();
    for (const r of (readsRes.data ?? []) as { inquiry_id: string; thread_type: string; last_read_message_id: string | null }[]) {
      if (!readMap.has(r.inquiry_id)) readMap.set(r.inquiry_id, new Set());
      readMap.get(r.inquiry_id)!.add(r.thread_type);
    }

    return (inquiryRes.data ?? []).map((row) => {
      const reads = readMap.get((row as { id: string }).id);
      // Simple heuristic: unread_count=1 if missing private read, +1 if missing group read
      const unread = (reads?.has("private") ? 0 : 1) + (reads?.has("group") ? 0 : 1);
      return {
        id: (row as { id: string }).id,
        status: (row as { status: string }).status,
        contact_name: (row as { contact_name: string }).contact_name,
        company: (row as { company: string | null }).company,
        event_date: (row as { event_date: string | null }).event_date,
        event_location: (row as { event_location: string | null }).event_location,
        quantity: (row as { quantity: number | null }).quantity,
        created_at: (row as { created_at: string }).created_at,
        next_action_by: (row as { next_action_by: string | null }).next_action_by,
        unread_count: unread,
      };
    });
  } catch (err) {
    logServerError("workspace.loadInquiriesForMessages", err);
    return [];
  }
}

/**
 * Load messages for a specific inquiry thread (private or group).
 * Returns messages with sender display_name resolved.
 */
export async function loadInquiryMessages(
  tenantId: string,
  inquiryId: string,
  threadType: ThreadType,
): Promise<WorkspaceMessage[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;

    const { data, error } = await supabase
      .from("inquiry_messages")
      .select("id, sender_user_id, body, created_at, profiles:sender_user_id(display_name)")
      .eq("inquiry_id", inquiryId)
      .eq("thread_type", threadType)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      logServerError("workspace.loadInquiryMessages", error);
      return [];
    }

    type MsgRow = {
      id: string;
      sender_user_id: string;
      body: string;
      created_at: string;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };

    return ((data ?? []) as unknown as MsgRow[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        sender_user_id: row.sender_user_id,
        sender_name: profile?.display_name?.trim() || row.sender_user_id.slice(0, 8),
        body: row.body,
        created_at: row.created_at,
        is_mine: row.sender_user_id === myUserId,
      };
    });
  } catch (err) {
    logServerError("workspace.loadInquiryMessages", err);
    return [];
  }
}

// ─── Calendar events ──────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string; // ISO date string "YYYY-MM-DD"
  status: string;
};

/**
 * Load all inquiries with a non-null event_date for the calendar page.
 * Returns events sorted by event_date ascending so month navigation is fast
 * client-side (no re-fetch on month change).
 */
export async function loadCalendarEvents(
  tenantId: string,
): Promise<CalendarEvent[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select("id, contact_name, company, event_date, status")
      .eq("tenant_id", tenantId)
      .not("event_date", "is", null)
      .order("event_date", { ascending: true })
      .limit(500);

    if (error) {
      logServerError("workspace.loadCalendarEvents", error);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: (row as { id: string }).id,
      contact_name: (row as { contact_name: string }).contact_name,
      company: (row as { company: string | null }).company,
      event_date: (row as { event_date: string }).event_date,
      status: (row as { status: string }).status,
    }));
  } catch (err) {
    logServerError("workspace.loadCalendarEvents", err);
    return [];
  }
}

// ─── Website data ────────────────────────────────────────────────────────────

export type WebsitePageItem = {
  id: string;
  slug: string;
  title: string;
  status: string; // 'published' | 'draft' | 'scheduled'
  updatedAt: string | null;
  updatedBy: string | null;
};

export type WebsitePostItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string | null;
};

export type WebsiteRedirectItem = {
  id: string;
  oldPath: string;
  newPath: string;
  statusCode: number;
  active: boolean;
};

export type WebsiteData = {
  pages: WebsitePageItem[];
  posts: WebsitePostItem[];
  redirects: WebsiteRedirectItem[];
  seoTitle: string | null;
  seoDescription: string | null;
  /** Fully-qualified storefront URL, e.g. "https://impronta.tulala.digital" */
  liveUrl: string | null;
};

/**
 * Load all data needed for the canonical workspace Website page:
 * CMS pages, posts, redirects, SEO identity, and the live storefront URL.
 *
 * Returns a safe empty state on any error — the page renders gracefully.
 */
export async function loadWebsiteData(tenantId: string): Promise<WebsiteData> {
  const empty: WebsiteData = {
    pages: [], posts: [], redirects: [],
    seoTitle: null, seoDescription: null, liveUrl: null,
  };
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const [pagesRaw, postsRes, redirectsRes, identity, liveUrl] = await Promise.all([
      listPagesForStaff(supabase, tenantId).catch(() => []),
      supabase
        .from("cms_posts")
        .select("id, slug, title, status, updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("cms_redirects")
        .select("id, old_path, new_path, status_code, active, updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(50),
      loadIdentityForStaff(supabase, tenantId).catch(() => null),
      getTenantPreviewOrigin(supabase, tenantId).catch(() => null),
    ]);

    type PostRow = { id: string; slug: string; title: string; status: string; updated_at: string | null };
    type RedirectRow = { id: string; old_path: string; new_path: string; status_code: number; active: boolean };

    return {
      pages: pagesRaw.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        updatedAt: (p as unknown as { updated_at: string | null }).updated_at ?? null,
        updatedBy: (p as unknown as { updated_by: string | null }).updated_by ?? null,
      })),
      posts: ((postsRes.data ?? []) as unknown as PostRow[]).map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        updatedAt: p.updated_at,
      })),
      redirects: ((redirectsRes.data ?? []) as unknown as RedirectRow[]).map((r) => ({
        id: r.id,
        oldPath: r.old_path,
        newPath: r.new_path,
        statusCode: r.status_code,
        active: r.active,
      })),
      seoTitle: identity?.seo_default_title ?? null,
      seoDescription: identity?.seo_default_description ?? null,
      liveUrl,
    };
  } catch (err) {
    logServerError("workspace.loadWebsiteData", err);
    return empty;
  }
}

// ─── Recent activity feed ─────────────────────────────────────────────────────

export type RecentActivityItem = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_role: string;
  inquiry_contact: string;
  inquiry_company: string | null;
  created_at: string;
};

/**
 * Load recent workspace activity from inquiry_events for the Overview page.
 * Joins inquiry context (contact_name, company) and actor profile display_name.
 * Returns the 10 most recent staff_only + participants events.
 */
export async function loadRecentActivity(
  tenantId: string,
): Promise<RecentActivityItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Fetch recent events with inquiry and actor profile context
    const { data, error } = await supabase
      .from("inquiry_events")
      .select(`
        id,
        event_type,
        actor_user_id,
        actor_role,
        created_at,
        inquiries!inner(contact_name, company, tenant_id)
      `)
      .eq("inquiries.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      logServerError("workspace.loadRecentActivity.events", error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Gather unique actor user IDs to look up display names
    type EventRow = {
      id: string;
      event_type: string;
      actor_user_id: string | null;
      actor_role: string;
      created_at: string;
      inquiries: { contact_name: string; company: string | null } | null;
    };
    const rows = data as unknown as EventRow[];

    const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean) as string[])];
    let nameMap: Map<string, string> = new Map();

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) nameMap.set(p.id, p.display_name);
      }
    }

    return rows
      .filter((r) => r.inquiries)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        event_type: r.event_type,
        actor_name: r.actor_user_id ? (nameMap.get(r.actor_user_id) ?? null) : null,
        actor_role: r.actor_role,
        inquiry_contact: r.inquiries!.contact_name,
        inquiry_company: r.inquiries!.company,
        created_at: r.created_at,
      }));
  } catch (err) {
    logServerError("workspace.loadRecentActivity", err);
    return [];
  }
}

// ─── Talent self-dashboard data ───────────────────────────────────────────────

export type TalentSelfProfile = {
  /** talent_profiles.id */
  id: string;
  displayName: string;
  /** Primary talent type label (e.g. "Fashion Model") */
  primaryTypeLabel: string | null;
  /** Home city display name */
  homeCity: string | null;
  /** workflow_status: draft | published | invited */
  workflowStatus: string;
  /** Roster status: active | pending | paused */
  rosterStatus: string;
  /** The talent's public profile URL code (profile_code) */
  profileCode: string | null;
  /** Display name of the agency they're viewing this in context of */
  agencyName: string;
};

/**
 * Load the talent's own profile + verify they're rostered in this agency.
 * Returns null if not found or not rostered.
 */
export async function loadTalentSelfProfile(
  userId: string,
  tenantId: string,
): Promise<TalentSelfProfile | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    // Step 1: Get the talent's profile
    const { data: profileRow, error: profileErr } = await supabase
      .from("talent_profiles")
      .select(`
        id,
        display_name,
        first_name,
        last_name,
        workflow_status,
        profile_code,
        talent_profile_taxonomy (
          relationship_type,
          taxonomy_terms ( name_en )
        ),
        talent_service_areas (
          service_kind,
          locations ( display_name_en )
        )
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr || !profileRow) {
      if (profileErr) logServerError("talent.loadSelfProfile.profile", profileErr);
      return null;
    }

    type ProfileRaw = {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      workflow_status: string | null;
      profile_code: string | null;
      talent_profile_taxonomy: { relationship_type: string | null; taxonomy_terms: { name_en: string | null } | null }[] | null;
      talent_service_areas: { service_kind: string | null; locations: { display_name_en: string | null } | null }[] | null;
    };

    const p = profileRow as unknown as ProfileRaw;

    // Step 2: Verify the talent is rostered in this tenant
    const { data: rosterRow, error: rosterErr } = await supabase
      .from("agency_talent_roster")
      .select("status, agencies!tenant_id ( display_name )")
      .eq("talent_profile_id", p.id)
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .maybeSingle();

    if (rosterErr || !rosterRow) return null;

    type RosterRaw = {
      status: string;
      agencies: { display_name: string } | { display_name: string }[] | null;
    };

    const roster = rosterRow as unknown as RosterRaw;
    const agencyRow = Array.isArray(roster.agencies) ? roster.agencies[0] : roster.agencies;

    const displayName =
      p.display_name?.trim() ||
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
      "Unnamed";

    const primaryTypeLabel =
      (p.talent_profile_taxonomy ?? [])
        .find((t) => t.relationship_type === "primary_role")
        ?.taxonomy_terms?.name_en ?? null;

    const homeCity =
      (p.talent_service_areas ?? [])
        .find((a) => a.service_kind === "home_base")
        ?.locations?.display_name_en ?? null;

    return {
      id: p.id,
      displayName,
      primaryTypeLabel,
      homeCity,
      workflowStatus: p.workflow_status ?? "draft",
      rosterStatus: roster.status,
      profileCode: p.profile_code ?? null,
      agencyName: agencyRow?.display_name ?? "Agency",
    };
  } catch (err) {
    logServerError("talent.loadSelfProfile", err);
    return null;
  }
}

export type TalentInquiryRow = {
  id: string;
  status: string;
  contact_name: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  created_at: string;
  /** participant status: invited | accepted | declined | pending */
  participantStatus: string;
};

/**
 * Load the talent's inquiries via inquiry_participants.
 * Shows all inquiries where the talent is a participant.
 */
export async function loadTalentInquiries(
  talentProfileId: string,
  tenantId: string,
): Promise<TalentInquiryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiry_participants")
      .select(`
        status,
        inquiries!inner (
          id,
          status,
          contact_name,
          company,
          event_date,
          event_location,
          created_at,
          tenant_id
        )
      `)
      .eq("talent_profile_id", talentProfileId)
      .eq("inquiries.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      logServerError("talent.loadInquiries", error);
      return [];
    }

    type PartRow = {
      status: string;
      inquiries: {
        id: string;
        status: string;
        contact_name: string;
        company: string | null;
        event_date: string | null;
        event_location: string | null;
        created_at: string;
      } | null;
    };

    return ((data ?? []) as unknown as PartRow[])
      .filter((r) => r.inquiries)
      .map((r) => ({
        id: r.inquiries!.id,
        status: r.inquiries!.status,
        contact_name: r.inquiries!.contact_name,
        company: r.inquiries!.company,
        event_date: r.inquiries!.event_date,
        event_location: r.inquiries!.event_location,
        created_at: r.inquiries!.created_at,
        participantStatus: r.status,
      }));
  } catch (err) {
    logServerError("talent.loadInquiries", err);
    return [];
  }
}

export type TalentAgencyRow = {
  id: string;
  agencyName: string;
  agencySlug: string;
  rosterStatus: string;
  plan: string;
  addedAt: string;
};

/**
 * Load all agency relationships for a talent (across all tenants).
 */
export async function loadTalentAgencies(
  talentProfileId: string,
): Promise<TalentAgencyRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_talent_roster")
      .select(`
        status,
        created_at,
        agencies!tenant_id ( id, display_name, slug, plan_tier )
      `)
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("talent.loadAgencies", error);
      return [];
    }

    type RosterRow2 = {
      status: string;
      created_at: string;
      agencies: { id: string; display_name: string; slug: string; plan_tier: string | null } | { id: string; display_name: string; slug: string; plan_tier: string | null }[] | null;
    };

    return ((data ?? []) as unknown as RosterRow2[]).map((row) => {
      const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
      return {
        id: agency?.id ?? row.created_at,
        agencyName: agency?.display_name ?? "Unknown agency",
        agencySlug: agency?.slug ?? "",
        rosterStatus: row.status,
        plan: agency?.plan_tier ?? "free",
        addedAt: row.created_at,
      };
    });
  } catch (err) {
    logServerError("talent.loadAgencies", err);
    return [];
  }
}

// ─── Client self-dashboard data ───────────────────────────────────────────────

export type ClientSelfProfile = {
  /** client_profiles.id (UUID, not user_id) */
  id: string;
  userId: string;
  displayName: string;
  company: string | null;
  /** Display name of the agency they're viewing this dashboard in context of */
  agencyName: string;
  agencySlug: string;
};

/**
 * Load the client's own profile and verify they have a relationship with
 * this agency (at least one inquiry to tenantId). Returns null if the user
 * is not a registered client or has no relationship with the given tenant.
 */
export async function loadClientSelfProfile(
  userId: string,
  tenantId: string,
): Promise<ClientSelfProfile | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    // Parallel: fetch client profile + agency name + verify relationship
    const [profileRes, agencyRes, inquiryCountRes] = await Promise.all([
      supabase
        .from("client_profiles")
        .select("id, company_name, profiles!inner(display_name)")
        .eq("user_id", userId)
        .maybeSingle(),

      supabase
        .from("agencies")
        .select("display_name, slug")
        .eq("id", tenantId)
        .maybeSingle(),

      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("client_user_id", userId),
    ]);

    if (profileRes.error) logServerError("client.loadSelfProfile.profile", profileRes.error);
    if (!profileRes.data) return null;

    // Must have at least one inquiry to this tenant to access the dashboard
    if ((inquiryCountRes.count ?? 0) === 0) return null;

    type ProfileRaw = {
      id: string;
      company_name: string | null;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };

    const row = profileRes.data as unknown as ProfileRaw;
    const profileJoin = row.profiles;
    const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;

    const agencyRow = agencyRes.data as { display_name: string; slug: string } | null;

    return {
      id: row.id,
      userId,
      displayName: profile?.display_name?.trim() || userId.slice(0, 8),
      company: row.company_name ?? null,
      agencyName: agencyRow?.display_name ?? "Agency",
      agencySlug: agencyRow?.slug ?? "",
    };
  } catch (err) {
    logServerError("client.loadSelfProfile", err);
    return null;
  }
}

export type ClientInquiryRow = {
  id: string;
  status: string;
  event_date: string | null;
  event_location: string | null;
  company: string | null;
  quantity: number | null;
  created_at: string;
  next_action_by: string | null;
};

/**
 * Load all inquiries submitted by this client to this tenant.
 * Ordered by most recent first. Cap at 200.
 */
export async function loadClientInquiries(
  userId: string,
  tenantId: string,
): Promise<ClientInquiryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select("id, status, event_date, event_location, company, quantity, created_at, next_action_by")
      .eq("tenant_id", tenantId)
      .eq("client_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("client.loadInquiries", error);
      return [];
    }

    return (data ?? []) as ClientInquiryRow[];
  } catch (err) {
    logServerError("client.loadInquiries", err);
    return [];
  }
}

export type ClientBookingRow = {
  id: string;
  event_date: string | null;
  event_location: string | null;
  company: string | null;
  quantity: number | null;
  created_at: string;
};

/**
 * Load confirmed bookings for a client at this tenant.
 * Booked = status IN ('booked', 'converted'). Ordered by event_date ascending.
 */
export async function loadClientBookings(
  userId: string,
  tenantId: string,
): Promise<ClientBookingRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select("id, event_date, event_location, company, quantity, created_at")
      .eq("tenant_id", tenantId)
      .eq("client_user_id", userId)
      .in("status", ["booked", "converted"])
      .order("event_date", { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) {
      logServerError("client.loadBookings", error);
      return [];
    }

    return (data ?? []) as ClientBookingRow[];
  } catch (err) {
    logServerError("client.loadBookings", err);
    return [];
  }
}

// ─── Phase 3.7 — Talent contact preferences ───────────────────────────────────

export type TalentContactPrefs = {
  talentProfileId: string;
  allowBasic: boolean;
  allowVerified: boolean;
  allowSilver: boolean;
  allowGold: boolean;
};

/**
 * Load contact preferences for a talent profile.
 * Returns null if no record exists yet (all tiers allowed by default).
 */
export async function loadTalentContactPrefs(
  talentProfileId: string,
  tenantId: string,
): Promise<TalentContactPrefs | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("talent_contact_preferences")
      .select("talent_profile_id, allow_basic, allow_verified, allow_silver, allow_gold")
      .eq("talent_profile_id", talentProfileId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      logServerError("talent.loadContactPrefs", error);
      return null;
    }
    if (!data) return null;

    type Row = {
      talent_profile_id: string;
      allow_basic: boolean;
      allow_verified: boolean;
      allow_silver: boolean;
      allow_gold: boolean;
    };
    const row = data as unknown as Row;
    return {
      talentProfileId: row.talent_profile_id,
      allowBasic: row.allow_basic,
      allowVerified: row.allow_verified,
      allowSilver: row.allow_silver,
      allowGold: row.allow_gold,
    };
  } catch (err) {
    logServerError("talent.loadContactPrefs", err);
    return null;
  }
}
