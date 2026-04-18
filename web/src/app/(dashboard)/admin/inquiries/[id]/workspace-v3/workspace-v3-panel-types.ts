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
