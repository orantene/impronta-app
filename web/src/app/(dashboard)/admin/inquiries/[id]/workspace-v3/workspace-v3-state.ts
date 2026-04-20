/**
 * Admin Workspace V3 — pure helpers for the status/"waiting on" strip (§5.4).
 *
 * Keep this intentionally tiny. No DB I/O. No React. All inputs come from the
 * canonical engine fields already resolved in `page.tsx`
 * (`normalizeWorkspaceStatus`, `next_action_by`, `isWorkspaceLocked`, etc.).
 *
 * Spec §5.5 principle 5: "state derivations come from the canonical engine...
 * No duplicate logic." — that's why the sentences only branch on
 * `WorkspaceStatus`, not on raw DB statuses.
 */
import type { WorkspaceStatus } from "@/lib/inquiry/inquiry-workspace-types";

export type WaitingOn = "client" | "talent" | "coordinator" | "admin" | "system" | null;

/**
 * Short sentence describing the current state for the strip below the header.
 * Locked statuses render terminal-style wording; open statuses describe the
 * next natural step.
 */
export function getWorkspaceStateSentence(status: WorkspaceStatus): string {
  switch (status) {
    case "draft":
      return "Inquiry is still in draft.";
    case "submitted":
      return "New inquiry — awaiting review.";
    case "reviewing":
      return "Reviewing inquiry details.";
    case "coordination":
      return "Coordinating talent and building the offer.";
    case "offer_pending":
      return "Offer sent — waiting on client response.";
    case "approved":
      return "Offer approved — ready to convert to a booking.";
    case "booked":
      return "Inquiry has been converted to a booking.";
    case "rejected":
      return "Inquiry was rejected.";
    case "expired":
      return "Inquiry expired before conversion.";
    case "closed_lost":
      return "Inquiry was closed as lost.";
    case "archived":
      return "Inquiry is archived.";
  }
}

/**
 * Normalize the raw `inquiries.next_action_by` DB value into the fixed set
 * the strip renders a chip for. Unknown / null inputs return `null`.
 */
export function resolveWaitingOnChip(nextActionBy: string | null): WaitingOn {
  if (!nextActionBy) return null;
  const v = nextActionBy.toLowerCase();
  if (v === "client" || v === "talent" || v === "coordinator" || v === "admin" || v === "system") {
    return v;
  }
  return null;
}

export function waitingOnLabel(w: WaitingOn): string {
  switch (w) {
    case "client":
      return "Waiting on: Client";
    case "talent":
      return "Waiting on: Talent";
    case "coordinator":
      return "Waiting on: Coordinator";
    case "admin":
      return "Waiting on: Admin";
    case "system":
      return "Waiting on: System";
    default:
      return "Waiting on: —";
  }
}
