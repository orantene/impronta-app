import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

// Type-only import — `_state.tsx` is "use client"; import type is erased.
import type { TalentProfile } from "@/app/prototypes/admin-shell/_state";

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
  /** Active open inquiries (status IN ('new','assigned','pending_offer','offer_sent')). */
  openInquiries: number;
  /** Active workspace members (agency_memberships.status = 'active'). */
  teamMembers: number;
  /** Roster rows with status = 'pending' — talent awaiting agency approval. */
  pendingApprovals: number;
};

export async function loadWorkspaceOverviewMetrics(
  tenantId: string,
): Promise<WorkspaceOverviewMetrics | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const [rosterRes, openInquiriesRes, teamRes, pendingRes] = await Promise.all([
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
        .in("status", ["new", "assigned", "pending_offer", "offer_sent"]),

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
          taxonomy_terms: { term_type: string | null; slug: string | null } | null;
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
            taxonomy_terms ( term_type, slug )
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

// ─── Work / Inquiries ────────────────────────────────────────────────────────

/** Terminal statuses excluded from the open Work queue. */
const INQUIRY_CLOSED_STATUSES = [
  "booked",
  "rejected",
  "expired",
  "closed_lost",
  "cancelled",
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

    // Step 1: Get distinct client user IDs + inquiry counts for this tenant.
    const { data: inquiryAggRows, error: inquiryErr } = await supabase
      .from("inquiries")
      .select("client_user_id, created_at")
      .eq("tenant_id", tenantId)
      .not("client_user_id", "is", null)
      .order("created_at", { ascending: false });

    if (inquiryErr) {
      logServerError("workspace.loadClients.inquiries", inquiryErr);
      return [];
    }

    // Aggregate: count + track latest per client
    const clientStats = new Map<string, { count: number; latestAt: string }>();
    for (const row of inquiryAggRows ?? []) {
      const uid = (row as { client_user_id: string | null }).client_user_id;
      if (!uid) continue;
      const existing = clientStats.get(uid);
      const createdAt = (row as { created_at: string }).created_at;
      if (!existing) {
        clientStats.set(uid, { count: 1, latestAt: createdAt });
      } else {
        clientStats.set(uid, { count: existing.count + 1, latestAt: existing.latestAt });
      }
    }

    const userIds = [...clientStats.keys()];
    if (userIds.length === 0) return [];

    // Step 2: Fetch client_profiles + profiles for those users.
    const { data: profileRows, error: profileErr } = await supabase
      .from("client_profiles")
      .select(
        "user_id, company_name, profiles!inner(display_name, account_status)",
      )
      .in("user_id", userIds);

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
      });
    }

    return out;
  } catch (err) {
    logServerError("workspace.loadClients", err);
    return [];
  }
}
