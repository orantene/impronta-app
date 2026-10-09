/**
 * Pure mapper for `public.workspace_overview_counts` (migration
 * 20261231356000): the ten inbox/roster reads the admin layout used to make as
 * ten PostgREST requests, now one function call. Kept free of `server-only` so
 * the shape is unit-testable. A missing key reads as 0 / null, never throws.
 */
export type OverviewCounts = {
  rosterTotal: number;
  rosterPublished: number;
  openInquiries: number;
  teamMembers: number;
  pendingApprovals: number;
  awaitingClientCount: number;
  draftInquiryCount: number;
  unassignedOpenCount: number;
  agencyActionCount: number;
  readyToBookCount: number;
  oldestCoordinatorCreatedAt: string | null;
  nextBooking: { contactName: string | null; eventDate: string | null } | null;
};

const EMPTY: OverviewCounts = {
  rosterTotal: 0,
  rosterPublished: 0,
  openInquiries: 0,
  teamMembers: 0,
  pendingApprovals: 0,
  awaitingClientCount: 0,
  draftInquiryCount: 0,
  unassignedOpenCount: 0,
  agencyActionCount: 0,
  readyToBookCount: 0,
  oldestCoordinatorCreatedAt: null,
  nextBooking: null,
};

function n(v: unknown): number {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function s(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function mapOverviewCounts(raw: unknown): OverviewCounts {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ...EMPTY };
  const r = raw as Record<string, unknown>;
  const nb = r.next_booking;
  const nextBooking =
    typeof nb === "object" && nb !== null
      ? {
          contactName: s((nb as Record<string, unknown>).contact_name),
          eventDate: s((nb as Record<string, unknown>).event_date),
        }
      : null;
  return {
    rosterTotal: n(r.roster_total),
    rosterPublished: n(r.roster_published),
    openInquiries: n(r.open_inquiries),
    teamMembers: n(r.team_members),
    pendingApprovals: n(r.pending_approvals),
    awaitingClientCount: n(r.awaiting_client),
    draftInquiryCount: n(r.draft_inquiries),
    unassignedOpenCount: n(r.unassigned_open),
    agencyActionCount: n(r.agency_action),
    readyToBookCount: n(r.ready_to_book),
    oldestCoordinatorCreatedAt: s(r.oldest_coordinator_created_at),
    nextBooking,
  };
}
