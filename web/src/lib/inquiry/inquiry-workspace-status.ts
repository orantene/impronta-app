import type { EffectiveWorkspaceRole, WorkspaceStatus } from "./inquiry-workspace-types";

/** Map legacy + DB inquiry_status values to canonical WorkspaceStatus. */
export function normalizeWorkspaceStatus(raw: string): WorkspaceStatus {
  const s = (raw ?? "").trim().toLowerCase();
  switch (s) {
    case "draft":
      return "draft";
    case "submitted":
    case "new":
    case "qualified":
      return "submitted";
    case "reviewing":
    case "in_progress":
    case "waiting_for_client":
    case "talent_suggested":
      return "reviewing";
    case "coordination":
      return "coordination";
    case "offer_pending":
      return "offer_pending";
    case "approved":
      return "approved";
    case "booked":
    case "converted":
      return "booked";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    case "closed_lost":
    case "closed":
      return "closed_lost";
    case "archived":
      return "archived";
    default:
      return "reviewing";
  }
}

export function resolveEffectiveRole(
  appRole: string | null | undefined,
  userId: string,
  inquiry: { coordinator_id: string | null; assigned_staff_id: string | null },
): EffectiveWorkspaceRole {
  const role = (appRole ?? "").trim();
  if (role === "client") return "client";
  if (role === "talent") return "talent";
  if (inquiry.coordinator_id && inquiry.coordinator_id === userId) return "coordinator";
  return "admin";
}
