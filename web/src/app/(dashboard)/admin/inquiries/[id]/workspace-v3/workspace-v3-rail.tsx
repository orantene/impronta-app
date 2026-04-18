"use client";

import { WorkspaceV3RailPanel } from "./workspace-v3-rail-panel";
import { WorkspaceV3PanelSummary } from "./workspace-v3-panel-summary";
import { WorkspaceV3PanelRequirementGroups } from "./workspace-v3-panel-requirement-groups";
import { WorkspaceV3PanelOffersApprovals } from "./workspace-v3-panel-offers-approvals";
import { WorkspaceV3PanelCoordinators } from "./workspace-v3-panel-coordinators";
import { WorkspaceV3PanelBooking } from "./workspace-v3-panel-booking";
import { WorkspaceV3PanelNeedsAttention } from "./workspace-v3-panel-needs-attention";
import { WorkspaceV3PanelRecentActivity } from "./workspace-v3-panel-recent-activity";
import type {
  BookingPanelData,
  CoordinatorsPanelData,
  NeedsAttentionPanelData,
  OffersApprovalsPanelData,
  RecentActivityPanelData,
  RequirementGroupsPanelData,
  SummaryPanelData,
} from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — right-rail container (§5.2).
 *
 * Renders the seven canonical collapsible panels in the order locked by the
 * spec. M3 scope is shell only: each panel carries a truthful empty state
 * that names the milestone wiring its content. M4.1–M4.7 will each replace
 * one panel's body.
 *
 * Intentionally not placing fake counts / fake data in any panel (contract
 * rule: "no UI path should depend on fake or derived assumptions when real
 * engine state exists"). The empty strings below are scope markers, not
 * stand-ins for data.
 */
export function WorkspaceV3Rail({
  userId,
  inquiryId,
  summary,
  requirementGroups,
  offersApprovals,
  coordinators,
  booking,
  needsAttention,
  recentActivity,
}: {
  userId: string;
  inquiryId: string;
  summary: SummaryPanelData;
  requirementGroups: RequirementGroupsPanelData;
  offersApprovals: OffersApprovalsPanelData;
  coordinators: CoordinatorsPanelData;
  booking: BookingPanelData;
  needsAttention: NeedsAttentionPanelData;
  recentActivity: RecentActivityPanelData;
}) {
  const common = { userId, inquiryId } as const;

  return (
    <aside
      aria-label="Inquiry details rail"
      className="flex flex-col gap-2"
      data-testid="workspace-v3-rail"
    >
      <WorkspaceV3RailPanel
        {...common}
        panelKey="summary"
        title="Summary"
        subtitle="Client · event · location"
      >
        <WorkspaceV3PanelSummary data={summary} />
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="requirement_groups"
        title="Requirement Groups"
        subtitle="Per-role need vs. selected / approved"
      >
        <WorkspaceV3PanelRequirementGroups data={requirementGroups} />
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="offers_approvals"
        title="Offers / Approvals"
        subtitle="Drafted · sent · pending · approved · rejected"
      >
        <WorkspaceV3PanelOffersApprovals data={offersApprovals} />
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="coordinators"
        title="Coordinators"
        subtitle="Primary + secondaries"
      >
        <WorkspaceV3PanelCoordinators data={coordinators} />
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="booking"
        title="Booking"
        subtitle="Conversion state · override visibility"
      >
        <WorkspaceV3PanelBooking data={booking} />
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="needs_attention"
        title="Needs Attention"
        subtitle="Derived Tier-1 alerts"
        defaultOpen={needsAttention.alerts.length > 0}
      >
        <WorkspaceV3PanelNeedsAttention data={needsAttention} />
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="recent_activity"
        title="Recent Activity"
        subtitle="Latest events from the audit stream"
        defaultOpen={false}
      >
        <WorkspaceV3PanelRecentActivity data={recentActivity} />
      </WorkspaceV3RailPanel>
    </aside>
  );
}
