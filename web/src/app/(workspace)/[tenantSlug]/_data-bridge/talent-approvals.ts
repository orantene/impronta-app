import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/** A talent's own approval state on an offer (mirrors `inquiry_approval_status`). */
export type TalentOfferApprovalStatus = "pending" | "accepted" | "rejected";

/** One inquiry's (participant, current-offer) pair, as seen by this talent. */
export type TalentApprovalLookup = {
  inquiryId: string;
  /** This talent's `inquiry_participants.id` on the inquiry. */
  participantId: string;
  /** The inquiry's `current_offer_id`, or null when no offer is live yet. */
  currentOfferId: string | null;
};

/**
 * Read THIS talent's own approval status for each inquiry's CURRENT offer.
 *
 * Keyed on (participant_id, offer_id) — the exact set the engine seeds in
 * `inquiry_approvals` after audit #1: `engine_send_offer` seeds the client
 * plus the offered line-item talents, and `engine_submit_approval` flips the
 * talent's own row to `accepted`. So an `accepted` result means "this talent
 * has approved the live offer" — the signal the talent thread needs to stop
 * re-showing the "Approve offer" button while the multi-party gate keeps the
 * inquiry `offer_pending`/`approved` (audit #12).
 *
 * Read via the service-role client (falling back to the caller's RLS client
 * only when service role is unconfigured, e.g. local dev): the SELECT policy
 * `inquiry_approvals_participant_select_own` gates on
 * `inquiry_participants.user_id = auth.uid()`, but the talent inbox loaders
 * deliberately key on `talent_profile_id` because participant.user_id is NULL
 * for pre-claim roster adds — an RLS-scoped read would silently miss exactly
 * those rows. The lookup is still scoped to the caller's own participant ids
 * (derived from the RLS-gated participant query upstream), so this never
 * leaks another talent's approval state.
 *
 * Returns a map keyed by inquiry id; an inquiry is absent when the talent has
 * no approval row for its current offer (or has no live offer yet).
 */
export async function loadMyOfferApprovalStatus(
  authedClient: SupabaseClient,
  lookups: TalentApprovalLookup[],
): Promise<Map<string, TalentOfferApprovalStatus>> {
  const withOffer = lookups.filter((l) => l.currentOfferId);
  if (withOffer.length === 0) return new Map();

  const client = createServiceRoleClient() ?? authedClient;
  const participantIds = [...new Set(withOffer.map((l) => l.participantId))];
  const offerIds = [...new Set(withOffer.map((l) => l.currentOfferId as string))];

  const { data, error } = await client
    .from("inquiry_approvals")
    .select("participant_id, offer_id, status")
    .in("participant_id", participantIds)
    .in("offer_id", offerIds);

  if (error) {
    logServerError("talent.loadMyOfferApprovalStatus", error);
    return new Map();
  }

  // Match the EXACT (participant, current-offer) pair per inquiry. The `.in`
  // filters above can return cross-pairs (participant A's row for offer B);
  // keying the lookup map on `participant|offer` makes those harmless — they
  // are simply never looked up.
  const byPair = new Map<string, TalentOfferApprovalStatus>();
  for (const row of (data ?? []) as {
    participant_id: string;
    offer_id: string;
    status: TalentOfferApprovalStatus;
  }[]) {
    byPair.set(`${row.participant_id}|${row.offer_id}`, row.status);
  }

  const byInquiry = new Map<string, TalentOfferApprovalStatus>();
  for (const l of withOffer) {
    const status = byPair.get(`${l.participantId}|${l.currentOfferId}`);
    if (status) byInquiry.set(l.inquiryId, status);
  }
  return byInquiry;
}
