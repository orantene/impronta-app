import type {
  AlertRow,
  NeedsAttentionPanelData,
} from "@/app/(dashboard)/admin/inquiries/[id]/workspace-v3/workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Needs Attention derivation (spec §5.2.6, roadmap M4.6).
 *
 * This is the single derivation module for Tier-1 workspace alerts. It is
 * strictly a projector: every alert is computed from signals that already
 * live on canonical engine outputs — no new business rules are minted here,
 * no thresholds invented, no state shortcuts.
 *
 * Inputs (all sourced from page.tsx, itself sourcing from engine helpers):
 *   • shortfall     — from `engine_inquiry_group_shortfall` RPC
 *   • approvals     — status breakdown on the current offer
 *   • offerStatus   — `inquiry_offers.status` of the current offer
 *   • isOfferReady  — pre-computed readiness from `isOfferReady` helper
 *   • hasPrimaryCoordinator — from `getInquiryCoordinators`
 *   • unreadCount   — truthful unread count from `inquiry_message_reads`
 *   • workspaceStatus — canonical `normalizeWorkspaceStatus` output
 *
 * Empty output = "Nothing needs your attention." Rendering is deliberately
 * ordered (most-actionable first): requirement shortfall → rejected approvals
 * → pending approvals → offer ready but unsent → missing primary coordinator
 * → unread messages. This order is fixed so the panel reads consistently
 * across inquiries.
 */

export type AlertDerivationInput = {
  workspaceStatus: string; // from normalizeWorkspaceStatus
  isLocked: boolean;
  shortfall: {
    role_key: string;
    shortfall: number;
  }[];
  approvals: {
    pending: number;
    accepted: number;
    rejected: number;
  };
  currentOfferId: string | null;
  currentOfferStatus: string | null;
  isOfferReady: boolean;
  hasPrimaryCoordinator: boolean;
  unreadCount: number;
};

export function deriveWorkspaceAlerts(
  input: AlertDerivationInput,
): NeedsAttentionPanelData {
  const alerts: AlertRow[] = [];

  // Locked / terminal inquiries never show alerts — the engine has already
  // declared them closed, so showing "needs attention" would contradict that.
  if (input.isLocked) return { alerts: [] };

  // 1. Requirement groups shortfall (fulfillment gap).
  if (input.shortfall.length > 0) {
    const totalShort = input.shortfall.reduce((acc, r) => acc + r.shortfall, 0);
    const byRole = input.shortfall
      .map((r) => `${r.role_key.replace(/_/g, " ")} (−${r.shortfall})`)
      .join(", ");
    alerts.push({
      key: "requirement_groups_unfulfilled",
      severity: "warning",
      label: `Requirement groups unmet (${totalShort} short)`,
      detail: byRole,
    });
  }

  // 2. Rejected approvals on the current offer.
  if (input.approvals.rejected > 0) {
    alerts.push({
      key: "approvals_rejected",
      severity: "warning",
      label: `${input.approvals.rejected} approval${input.approvals.rejected === 1 ? "" : "s"} rejected`,
      detail: "Review talent declines and rebuild the offer.",
    });
  }

  // 3. Pending approvals on the current offer.
  if (input.approvals.pending > 0 && input.currentOfferStatus === "sent") {
    alerts.push({
      key: "approvals_pending",
      severity: "info",
      label: `${input.approvals.pending} approval${input.approvals.pending === 1 ? "" : "s"} pending`,
      detail: "Waiting on talent response.",
    });
  }

  // 4. Offer is ready but not yet sent (draft offer, reviewing state).
  if (
    input.isOfferReady &&
    (input.currentOfferStatus === "draft" || input.currentOfferStatus === null) &&
    !["booked", "approved"].includes(input.workspaceStatus)
  ) {
    alerts.push({
      key: "offer_ready_not_sent",
      severity: "info",
      label: "Offer ready to send",
      detail: "Roster and pricing are set — send to the client when ready.",
    });
  }

  // 5. No primary coordinator assigned, inquiry past intake.
  if (
    !input.hasPrimaryCoordinator &&
    ["reviewing", "coordination", "offer_pending"].includes(input.workspaceStatus)
  ) {
    alerts.push({
      key: "coordinator_unassigned",
      severity: "warning",
      label: "No primary coordinator",
      detail: "Assign one from the Coordinators panel.",
    });
  }

  // 6. Unread messages for the current viewer.
  if (input.unreadCount > 0) {
    alerts.push({
      key: "unread_messages",
      severity: "info",
      label: `${input.unreadCount} thread${input.unreadCount === 1 ? "" : "s"} with unread messages`,
      detail: null,
    });
  }

  return { alerts };
}
