import type { SupabaseClient } from "@supabase/supabase-js";

export type ParticipantSummary = {
  participantId: string;
  status: string;
};

export type ApprovalResolution = {
  allApproved: boolean;
  pending: ParticipantSummary[];
  rejected: ParticipantSummary[];
  summary: { total: number; accepted: number; pending: number; rejected: number };
};

/**
 * Generic approval summary — inquiry-first; plain context for future reuse (Principle 1).
 */
export async function checkAllApprovalsComplete(
  supabase: SupabaseClient,
  inquiryId: string,
  offerId: string,
): Promise<ApprovalResolution> {
  const { data: rows, error } = await supabase
    .from("inquiry_approvals")
    .select("participant_id, status")
    .eq("inquiry_id", inquiryId)
    .eq("offer_id", offerId);

  if (error || !rows?.length) {
    return {
      allApproved: false,
      pending: [],
      rejected: [],
      summary: { total: 0, accepted: 0, pending: 0, rejected: 0 },
    };
  }

  const pending: ParticipantSummary[] = [];
  const rejected: ParticipantSummary[] = [];
  let accepted = 0;
  for (const r of rows) {
    if (r.status === "pending") pending.push({ participantId: r.participant_id, status: r.status });
    else if (r.status === "rejected") rejected.push({ participantId: r.participant_id, status: r.status });
    else if (r.status === "accepted") accepted += 1;
  }
  const total = rows.length;
  const allApproved = total > 0 && accepted === total && pending.length === 0 && rejected.length === 0;
  return {
    allApproved,
    pending,
    rejected,
    summary: {
      total,
      accepted,
      pending: pending.length,
      rejected: rejected.length,
    },
  };
}
