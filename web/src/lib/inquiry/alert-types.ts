/**
 * Needs Attention panel alert types — extracted from workspace-v3-panel-types
 * during (dashboard) legacy route group deletion (Phase 4).
 *
 * These are the canonical data contracts for alert rows derived in
 * `inquiry-alerts.ts` and rendered by the admin workspace needs-attention panel.
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
