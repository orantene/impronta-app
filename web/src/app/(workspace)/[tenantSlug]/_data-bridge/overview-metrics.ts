import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/overview-metrics.ts — workspace KPI loader.
 *
 * Split out of `_data-bridge.ts` (rev 13). Powers the overview page +
 * top-bar counts. Single Promise.all fan-out across 8 small COUNT queries
 * so the page renders in one round-trip.
 */

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
  /** Days since the oldest coordinator-pending inquiry was created. Null if none. */
  oldestCoordinatorWaitDays: number | null;
  /** Label for the next upcoming confirmed booking (contact_name + event_date). Null if none. */
  nextBookingLabel: string | null;
  /** ISO date of the next upcoming booking. Null if none. */
  nextBookingDate: string | null;
};

export async function loadWorkspaceOverviewMetrics(
  tenantId: string,
): Promise<WorkspaceOverviewMetrics | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const [rosterRes, openInquiriesRes, teamRes, pendingRes, awaitingClientRes, draftInqRes, oldestCoordRes, nextBookingRes] = await Promise.all([
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

      // Oldest coordinator-pending inquiry (for urgency signal in TodaysFocusCard)
      supabase
        .from("inquiries")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .eq("next_action_by", "coordinator")
        .not("status", "in", `(rejected,expired,cancelled,booked,converted)`)
        .order("created_at", { ascending: true })
        .limit(1),

      // Next upcoming confirmed booking (for quiet-day overview signal)
      supabase
        .from("inquiries")
        .select("contact_name, event_date")
        .eq("tenant_id", tenantId)
        .in("status", ["booked", "converted"])
        .gte("event_date", new Date().toISOString().slice(0, 10))
        .order("event_date", { ascending: true })
        .limit(1),
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

    const oldestCoordCreatedAt = (oldestCoordRes.data?.[0] as { created_at: string } | undefined)?.created_at ?? null;
    const oldestCoordinatorWaitDays = oldestCoordCreatedAt
      ? Math.floor((Date.now() - new Date(oldestCoordCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    type NextBookingRow = { contact_name: string | null; event_date: string | null };
    const nextBookingRow = (nextBookingRes.data?.[0] as NextBookingRow | undefined) ?? null;
    const nextBookingDate = nextBookingRow?.event_date ?? null;
    const nextBookingLabel = nextBookingRow?.contact_name
      ? (() => {
          if (!nextBookingDate) return nextBookingRow.contact_name;
          const d = new Date(nextBookingDate);
          const month = d.toLocaleDateString("en-GB", { month: "short" });
          const day = d.getDate();
          return `${nextBookingRow.contact_name} · ${month} ${day}`;
        })()
      : null;

    return {
      rosterTotal,
      rosterPublished,
      openInquiries: openInquiriesRes.count ?? 0,
      teamMembers: teamRes.count ?? 0,
      pendingApprovals: pendingRes.count ?? 0,
      awaitingClientCount: awaitingClientRes.count ?? 0,
      draftInquiryCount: draftInqRes.count ?? 0,
      oldestCoordinatorWaitDays,
      nextBookingLabel,
      nextBookingDate,
    };
  } catch (err) {
    logServerError("workspace.loadOverviewMetrics", err);
    return null;
  }
}

/**
 * Return the count of roster rows with status = 'pending' for this tenant.
 * Used by the admin layout to badge the Talent tab.
 */
export async function loadPendingRosterCount(tenantId: string): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return 0;
    const { count } = await supabase
      .from("agency_talent_roster")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending");
    return count ?? 0;
  } catch {
    return 0;
  }
}
