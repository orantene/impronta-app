/**
 * Admin Workspace V3 — rail panel data contracts.
 *
 * One type per rail panel body. Each panel is a dumb renderer over the
 * type declared here; page.tsx is the sole data-loader (matching the
 * existing V2 pattern). Keeping these shapes centralized means panel
 * components never re-derive engine state (spec §5.5 principle 5).
 *
 * Added per roadmap milestones:
 *   M4.1 → SummaryPanelData
 *   M4.2 → RequirementGroupsPanelData  (pending)
 *   M4.3 → OffersApprovalsPanelData    (pending)
 *   M4.4 → CoordinatorsPanelData       (pending)
 *   M4.5 → BookingPanelData            (pending)
 *   M4.6 → NeedsAttentionPanelData     (pending)
 *   M4.7 → RecentActivityPanelData     (pending)
 */

/**
 * Summary panel (spec §5.2.1).
 *
 * Only fields that exist on the canonical engine record are surfaced.
 * `budgetBand` is intentionally NOT a field here: the `inquiries` table
 * does not carry a budget column today. A budget row will be added once
 * the schema has a source of truth (tracked in the M4.1 risks note) —
 * until then, showing a placeholder would violate the "no fake data"
 * contract rule.
 */
export type SummaryPanelData = {
  clientName: string | null;
  company: string | null;
  eventType: string | null;
  eventDate: string | null; // ISO date — formatting happens in the renderer
  eventLocation: string | null;
  quantity: number | null;
  statusSentence: string; // canonical, sourced from getWorkspaceStateSentence
  lastActivityAt: string; // inquiry.updated_at (ISO)
};

/**
 * Requirement Groups panel (spec §5.2.2).
 *
 * One row per `inquiry_requirement_groups` row, enriched with engine-canonical
 * counters:
 *   • selected = talent participants with status in ('invited','active')
 *     whose `requirement_group_id` equals this group. Sourced from the M1.2
 *     `getRequirementGroups` helper.
 *   • approved = talent whose `inquiry_approvals` row for the current offer
 *     is `accepted`. Sourced from the M2.3 `engine_inquiry_group_shortfall`
 *     RPC — the canonical fulfillment computer. For fully-fulfilled groups
 *     the RPC omits them (shortfall === 0), so `approved` is backfilled to
 *     `quantity_required` in that case so the UI does not underreport.
 *   • shortfall = `quantity_required - approved`, clamped to 0. Surfaced
 *     directly so the panel can highlight unmet groups without re-deriving.
 *
 * "Confirmed" (spec §5.2.2 "C confirmed") is NOT included: there is no
 * per-group confirmed state today — the only post-approval transition is
 * booking conversion, which is tracked at the inquiry / booking level via
 * `agency_bookings` + `booking_talent`. Adding a per-group confirmed counter
 * would require either a `requirement_group_id` FK on `booking_talent` or a
 * derived SQL view; either is out of M4 scope. Tracked in the M4.2 risks.
 */
export type RequirementGroupRowData = {
  id: string;
  roleKey: string;
  quantityRequired: number;
  selected: number;
  approved: number;
  shortfall: number;
  notes: string | null;
};

export type RequirementGroupsPanelData = {
  groups: RequirementGroupRowData[];
  /** Mirrors engine_inquiry_group_shortfall result: true iff every group is fulfilled. */
  allFulfilled: boolean;
};

/**
 * Offers / Approvals panel (spec §5.2.3).
 *
 * Two orthogonal counters, intentionally not flattened:
 *   • Offer-level: total offer versions for this inquiry, split by
 *     `inquiry_offers.status` (draft / sent / rejected / accepted).
 *   • Approval-level (per-talent): approvals on the *current* offer,
 *     split by `inquiry_approvals.status` (pending / accepted / rejected).
 *
 * Keeping both dimensions separate avoids the lossy "one aggregate bucket"
 * view the spec shorthand might suggest: an offer can be "sent" while half
 * its participants are still "pending" approval — conflating those into one
 * counter would erase per-talent truth.
 */
export type OffersApprovalsPanelData = {
  offers: {
    draft: number;
    sent: number;
    accepted: number;
    rejected: number;
  };
  currentOfferId: string | null;
  approvals: {
    pending: number;
    accepted: number;
    rejected: number;
  };
};

/**
 * Coordinators panel (spec §5.2.4).
 *
 * Pure projection of `getInquiryCoordinators`. M4.4 is read-only; inline
 * assign/promote/remove actions (M2.1 wiring + §2.3a "Remove hidden on
 * primary") are deferred from this milestone to keep panels as pure
 * renderers per the M4 execution-mode brief.
 */
export type CoordinatorRow = {
  userId: string;
  displayName: string | null;
  assignedAt: string;
};

export type CoordinatorsPanelData = {
  primary: CoordinatorRow | null;
  secondaries: CoordinatorRow[];
  former: CoordinatorRow[];
};

/**
 * Booking panel (spec §5.2.5).
 *
 * Read-only for M4.5 per the execution-mode brief. Convert / override
 * actions remain in the existing V2 convert panel and will move here in a
 * later milestone (roadmap M4.5 line).
 *
 * `state` is the engine-canonical booking state for this inquiry:
 *   • "none"             — no agency_bookings row yet
 *   • "ready_to_convert" — no booking, but all requirement groups fulfilled
 *   • "not_ready"        — no booking, groups not fulfilled
 *   • "booked"           — at least one booking exists
 *
 * `override` is surfaced iff any linked booking has
 * `agency_bookings.created_with_override = true` (schema added in M2.3).
 */
export type BookingPanelData = {
  state: "none" | "not_ready" | "ready_to_convert" | "booked";
  bookingCount: number;
  firstBooking: {
    id: string;
    title: string | null;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
  override: {
    active: boolean;
    reason: string | null;
  };
};

/**
 * Needs Attention panel (spec §5.2.6).
 *
 * Each alert is derived from existing engine signals in the
 * `lib/inquiry/inquiry-alerts.ts` helper. No new business rules are minted
 * here — the panel is a pure renderer over pre-derived alert rows.
 */
export type AlertSeverity = "warning" | "info";
export type AlertKey =
  | "requirement_groups_unfulfilled"
  | "approvals_pending"
  | "approvals_rejected"
  | "coordinator_unassigned"
  | "offer_ready_not_sent"
  | "unread_messages";
export type AlertRow = {
  key: AlertKey;
  severity: AlertSeverity;
  label: string;
  detail: string | null;
};

export type NeedsAttentionPanelData = {
  alerts: AlertRow[];
};

/**
 * Recent Activity panel (spec §5.2.7).
 *
 * Last five `inquiry_events` rows for this inquiry, sorted newest-first.
 * No synthetic feed, no cross-source aggregation — straight from the audit
 * stream. Drill-down to full `InquiryTimeline` is an M5.5 concern.
 */
export type RecentActivityEvent = {
  id: string;
  type: string;
  createdAt: string;
  actorName: string | null;
  payload: Record<string, unknown>;
};

export type RecentActivityPanelData = {
  events: RecentActivityEvent[];
  /** True when inquiry_events has more than `events.length` rows for this inquiry. */
  hasMore: boolean;
};
