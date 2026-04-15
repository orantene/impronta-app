/**
 * Inquiry workflow phases — maps legacy + canonical DB statuses to a single phase model.
 */

export type InquiryWorkflowPhase =
  | "draft"
  | "submitted"
  | "coordination"
  | "offer_pending"
  | "approved"
  | "booked"
  | "rejected"
  | "expired"
  | "archived";

export type TransitionBlockReason =
  | "invalid_status_transition"
  | "inquiry_frozen"
  | "post_booking_immutable"
  | "no_active_offer"
  | "offer_not_sent"
  | "approvals_incomplete"
  | "roster_offer_mismatch"
  | "missing_coordinator"
  | "missing_client"
  | "version_conflict"
  | "rate_limited"
  | "forbidden";

export type TransitionCheck =
  | { ok: true }
  | { ok: false; reason: TransitionBlockReason };

export const CANONICAL_STATUSES = [
  "draft",
  "submitted",
  "coordination",
  "offer_pending",
  "approved",
  "booked",
  "rejected",
  "expired",
  "archived",
] as const;

export type CanonicalInquiryStatus = (typeof CANONICAL_STATUSES)[number];

export const LEGACY_STATUSES = [
  "new",
  "reviewing",
  "waiting_for_client",
  "talent_suggested",
  "in_progress",
  "qualified",
  "converted",
  "closed",
  "closed_lost",
] as const;

/** Display labels for every DB value (legacy + canonical). */
export const STATUS_LABELS: Record<string, string> = {
  // canonical
  draft: "Draft",
  submitted: "Submitted",
  coordination: "Coordination",
  offer_pending: "Offer pending",
  approved: "Approved",
  booked: "Booked",
  rejected: "Rejected",
  expired: "Expired",
  archived: "Archived",
  // legacy
  new: "New",
  reviewing: "Under review",
  waiting_for_client: "Waiting for client",
  talent_suggested: "Talent suggested",
  in_progress: "In progress",
  qualified: "Qualified",
  converted: "Converted",
  closed: "Closed",
  closed_lost: "Closed (lost)",
};

const STATUS_TO_PHASE: Record<string, InquiryWorkflowPhase> = {
  draft: "draft",
  submitted: "submitted",
  coordination: "coordination",
  offer_pending: "offer_pending",
  approved: "approved",
  booked: "booked",
  rejected: "rejected",
  expired: "expired",
  archived: "archived",
  new: "submitted",
  reviewing: "coordination",
  waiting_for_client: "coordination",
  talent_suggested: "coordination",
  in_progress: "coordination",
  qualified: "coordination",
  converted: "booked",
  closed_lost: "rejected",
  closed: "archived",
};

/** Allowed transitions for canonical statuses (legacy reads map to phases first). */
const CANONICAL_EDGES: Record<CanonicalInquiryStatus, CanonicalInquiryStatus[]> = {
  draft: ["submitted", "archived"],
  submitted: ["coordination", "rejected", "expired", "archived"],
  coordination: ["offer_pending", "rejected", "expired", "archived"],
  offer_pending: ["coordination", "approved", "rejected", "expired", "archived"],
  approved: ["booked", "coordination", "rejected", "archived"],
  booked: ["archived"],
  rejected: ["archived"],
  expired: ["archived"],
  archived: [],
};

export function getWorkflowPhase(status: string): InquiryWorkflowPhase {
  return STATUS_TO_PHASE[status] ?? "coordination";
}

export function isTerminalPhase(status: string): boolean {
  const p = getWorkflowPhase(status);
  return p === "booked" || p === "rejected" || p === "expired" || p === "archived";
}

export function isMutablePhase(status: string, isFrozen?: boolean): boolean {
  if (isFrozen) return false;
  const p = getWorkflowPhase(status);
  if (p === "booked" || p === "archived") return false;
  return true;
}

export function getAllowedTransitions(status: string): string[] {
  const canonical = mapToCanonicalStatus(status);
  return [...(CANONICAL_EDGES[canonical] ?? [])];
}

function mapToCanonicalStatus(status: string): CanonicalInquiryStatus {
  const phase = getWorkflowPhase(status);
  switch (phase) {
    case "draft":
      return "draft";
    case "submitted":
      return "submitted";
    case "coordination":
      return "coordination";
    case "offer_pending":
      return "offer_pending";
    case "approved":
      return "approved";
    case "booked":
      return "booked";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    case "archived":
    default:
      return "archived";
  }
}

export type TransitionContext = {
  isFrozen?: boolean;
};

export function canTransition(
  fromStatus: string,
  toStatus: string,
  context?: TransitionContext,
): TransitionCheck {
  if (context?.isFrozen) {
    return { ok: false, reason: "inquiry_frozen" };
  }
  const fromCanon = mapToCanonicalStatus(fromStatus);
  const toCanon = mapToCanonicalStatus(toStatus);
  const allowed = CANONICAL_EDGES[fromCanon];
  if (!allowed?.includes(toCanon)) {
    return { ok: false, reason: "invalid_status_transition" };
  }
  return { ok: true };
}

export function resolveNextActionBy(
  status: string,
  ctx?: { hasPendingTalentAcceptance?: boolean; hasPendingTalentApproval?: boolean },
): "client" | "coordinator" | "talent" | "system" | null {
  const phase = getWorkflowPhase(status);
  switch (phase) {
    case "draft":
      return "client";
    case "submitted":
      return "coordinator";
    case "coordination":
      if (ctx?.hasPendingTalentAcceptance) return "talent";
      return "coordinator";
    case "offer_pending":
      if (ctx?.hasPendingTalentApproval) return "talent";
      return "client";
    case "approved":
      return "coordinator";
    default:
      return null;
  }
}

export function validateInquiryConsistency(input: {
  status: string;
  next_action_by: string | null;
  coordinator_id: string | null;
  current_offer_id: string | null;
  booked_at: string | null;
  is_frozen: boolean;
  frozen_at: string | null;
  frozen_by_user_id: string | null;
}): { ok: true } | { ok: false; message: string } {
  const phase = getWorkflowPhase(input.status);
  if (isTerminalPhase(input.status) && input.next_action_by != null) {
    return { ok: false, message: "next_action_by must be null in terminal phase" };
  }
  if (phase === "booked" && !input.booked_at) {
    return { ok: false, message: "booked status requires booked_at" };
  }
  if (input.is_frozen && (!input.frozen_at || !input.frozen_by_user_id)) {
    return { ok: false, message: "frozen inquiry requires frozen_at and frozen_by_user_id" };
  }
  return { ok: true };
}
