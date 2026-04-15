import type { InquiryWorkspaceApproval, InquiryWorkspaceRosterEntry } from "./inquiry-workspace-types";

export type ApprovalCompleteness = {
  complete: boolean;
  pending: { participantId: string; name: string; role: string }[];
  total: number;
  accepted: number;
};

/**
 * Resolves whether all required approvals are accepted for the current offer.
 * Roster: only active + invited talent require approval when offer is in play.
 */
export function resolveApprovalCompleteness(
  approvals: InquiryWorkspaceApproval[],
  roster: InquiryWorkspaceRosterEntry[],
  currentOfferId: string | null,
  clientAccountId: string | null,
): ApprovalCompleteness {
  if (!currentOfferId) {
    return { complete: false, pending: [], total: 0, accepted: 0 };
  }

  const relevant = approvals.filter((a) => a.offer_id === currentOfferId);
  const activeTalentIds = new Set(
    roster
      .filter((r) => r.status === "active" || r.status === "invited")
      .map((r) => r.talent_profile_id),
  );

  const pending: { participantId: string; name: string; role: string }[] = [];
  let accepted = 0;

  for (const a of relevant) {
    if (a.status === "accepted") accepted += 1;
    else if (a.status === "pending") {
      const pid = a.participant_id?.trim() ?? "";
      pending.push({
        participantId: pid || "unknown",
        name: pid ? pid.slice(0, 8) : "—",
        role: "participant",
      });
    }
  }

  const total = relevant.length;
  const complete = total > 0 && pending.length === 0 && accepted === total;

  return {
    complete,
    pending,
    total,
    accepted,
  };
}
