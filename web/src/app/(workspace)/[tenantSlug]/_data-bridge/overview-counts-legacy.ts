import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import type { OverviewCounts } from "./overview-counts";

/**
 * The per-table reads `workspace_overview_counts` replaced. Used ONLY when that
 * function is missing (code deployed before migration 20261231356000) or errors,
 * so a wrong order can never paint zero counts. Same queries, same RLS, same
 * results as before the RPC existed; slower (ten requests), which is the point
 * of the RPC.
 */
export async function loadOverviewCountsLegacy(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<OverviewCounts> {
  const [rosterRes, openInquiriesRes, teamRes, pendingRes, awaitingClientRes, draftInqRes, oldestCoordRes, nextBookingRes, unassignedRes, agencyActionRes, readyToBookRes] = await Promise.all([
      // Roster: total + published count
      supabase
        .from("agency_talent_roster")
        .select(
          "status, talent_profiles!talent_profile_id ( workflow_status )",
          { count: "exact", head: false },
        )
        .eq("tenant_id", tenantId)
        .neq("status", "removed"),

      // Open inquiries.
      //
      // `.is("event_id", null)` EXCLUDES LINEUP BOOKINGS, and the direction is
      // the point. This number is read as INBOUND DEMAND -- people asking to
      // buy. A lineup inquiry is the workspace's own OUTBOUND supply: the venue
      // asking a performer to play. Same table, same column, opposite direction
      // of intent.
      //
      // Without the filter, a venue publishing an event with eight performers
      // watches "open inquiries" jump by eight overnight, for bookings it
      // initiated itself, and reasonably concludes eight people enquired about a
      // night nobody enquired about.
      //
      // Consent from the Workspace & Dashboards Director, who own this file.
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("event_id", null)
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

      // Draft inquiries the AGENCY owes a send on. Excludes guest pre-send
      // early-rows (placeholder contact `pending-...@guest.impronta`): those are
      // the GUEST's in-progress drafts, not the agency's "to send" work, and must
      // not light up the "Needs you now" surface until their first real send
      // promotes them to `submitted`.
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["draft"])
        .not("contact_email", "like", "pending-%@guest.impronta"),

      // Oldest coordinator-pending inquiry (for urgency signal in TodaysFocusCard).
      // Exclude terminal statuses. NB: there is no `cancelled` inquiry_status —
      // the cancel flow maps to `rejected` (close_reason='client_cancelled'). The
      // old list carried the literal `cancelled`, which is not a valid enum value,
      // so PostgREST cast-failed the WHOLE query (Postgres: "invalid input value
      // for enum inquiry_status: cancelled") on every overview load and this
      // urgency signal silently returned nothing.
      supabase
        .from("inquiries")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .eq("next_action_by", "coordinator")
        .not("status", "in", `(rejected,expired,booked,converted,closed,closed_lost,archived)`)
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
      // "Your move" cohorts — positive status filters only (an invalid enum in
      // a NOT-IN filter would error the whole query). Mutually exclusive by status.
      // Unassigned: open + no coordinator of record.
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("coordinator_id", null)
        .in("status", ["submitted", "coordination", "offer_pending"]),
      // Assigned + the agency owes the next move.
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .not("coordinator_id", "is", null)
        .in("next_action_by", ["coordinator", "admin"])
        .in("status", ["submitted", "coordination", "offer_pending"]),
      // Ready to book — client-approved, not yet converted.
      supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "approved")
  ]);

  for (const [label, res] of [
    ["roster", rosterRes],
    ["inquiries", openInquiriesRes],
    ["team", teamRes],
    ["pending", pendingRes],
  ] as const) {
    if (res.error) logServerError(`workspace.loadOverviewMetrics.${label}`, res.error);
  }

  type RosterRow = {
    status: string;
    talent_profiles: { workflow_status: string | null } | null;
  };
  const rosterRows = (rosterRes.data ?? []) as unknown as RosterRow[];
  const nextBookingRow = (nextBookingRes.data?.[0] as { contact_name: string | null; event_date: string | null } | undefined) ?? null;

  return {
    rosterTotal: rosterRows.length,
    rosterPublished: rosterRows.filter(
      (r) => r.status === "active" && r.talent_profiles?.workflow_status === "published",
    ).length,
    openInquiries: openInquiriesRes.count ?? 0,
    teamMembers: teamRes.count ?? 0,
    pendingApprovals: pendingRes.count ?? 0,
    awaitingClientCount: awaitingClientRes.count ?? 0,
    draftInquiryCount: draftInqRes.count ?? 0,
    unassignedOpenCount: unassignedRes.count ?? 0,
    agencyActionCount: agencyActionRes.count ?? 0,
    readyToBookCount: readyToBookRes.count ?? 0,
    oldestCoordinatorCreatedAt:
      (oldestCoordRes.data?.[0] as { created_at: string } | undefined)?.created_at ?? null,
    nextBooking: nextBookingRow
      ? { contactName: nextBookingRow.contact_name, eventDate: nextBookingRow.event_date }
      : null,
  };
}
