"use client";

import { WorkspaceV3RailPanel } from "./workspace-v3-rail-panel";

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
}: {
  userId: string;
  inquiryId: string;
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
        <p>Wiring in M4.1 — loaded from inquiry record.</p>
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="requirement_groups"
        title="Requirement Groups"
        subtitle="Per-role need vs. selected / approved / confirmed"
      >
        <p>Wiring in M4.2 — from getRequirementGroups.</p>
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="offers_approvals"
        title="Offers / Approvals"
        subtitle="Drafted · sent · pending · approved · rejected"
      >
        <p>Wiring in M4.3 — from inquiry_offers / inquiry_approvals.</p>
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="coordinators"
        title="Coordinators"
        subtitle="Primary + secondaries · assign / promote / remove"
      >
        <p>Wiring in M4.4 — from inquiry_coordinators, uses M2.1 actions.</p>
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="booking"
        title="Booking"
        subtitle="Convert · override (admin) · post-booking summary"
      >
        <p>Wiring in M4.5 — uses M2.3 gating + override modal.</p>
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="needs_attention"
        title="Needs Attention"
        subtitle="Derived Tier-1 alerts"
        defaultOpen={false}
      >
        <p>Wiring in M4.6 — derived alerts module.</p>
      </WorkspaceV3RailPanel>

      <WorkspaceV3RailPanel
        {...common}
        panelKey="recent_activity"
        title="Recent Activity"
        subtitle="Latest events from the audit stream"
        defaultOpen={false}
      >
        <p>Wiring in M4.7 — InquiryTimeline preview mode.</p>
      </WorkspaceV3RailPanel>
    </aside>
  );
}
