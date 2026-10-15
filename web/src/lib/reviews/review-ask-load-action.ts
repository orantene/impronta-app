"use server";

/**
 * TUL-981: the "Ask for a review" card's loaders, as two round-trips instead of
 * three. Server actions called from one client run in sequence, so three
 * separate calls stacked to ~3 s on staging. Phase 1 (bookings + filed invites,
 * in parallel) is all the picker needs; phase 2 (email-picker candidates) loads
 * after the card is ready. Candidate selection runs here, not in the browser,
 * which also keeps it out of the admin bundle.
 */

import { loadClientReviewablesAction } from "@/lib/reviews/review-actions";
import { reviewInviteCandidates, type ReviewInviteCandidate } from "@/lib/reviews/review-invite-candidates";
import { loadReviewRequestsForOwnerAction } from "@/lib/reviews/review-request-actions";
import type { ReviewableCounterparty } from "@/lib/reviews/review-types";
import { loadTalentClients } from "@/lib/talent/clients-actions";

export async function loadReviewAskBookingsAction(
  tenantSlug: string,
  talentProfileId: string,
): Promise<{ reviewables: ReviewableCounterparty[]; askedBookingIds: string[] }> {
  const [reviewables, requests] = await Promise.all([
    loadClientReviewablesAction(tenantSlug),
    loadReviewRequestsForOwnerAction(tenantSlug, talentProfileId),
  ]);
  return {
    reviewables,
    askedBookingIds: requests.map((r) => r.bookingId).filter((id): id is string => !!id),
  };
}

export async function loadReviewAskPicksAction(
  tenantSlug: string,
  talentProfileId: string,
): Promise<ReviewInviteCandidate[]> {
  const [requests, clients] = await Promise.all([
    loadReviewRequestsForOwnerAction(tenantSlug, talentProfileId),
    loadTalentClients(talentProfileId).catch(() => ({ ok: false as const })),
  ]);
  if (!clients.ok) return [];
  const askedEmails = new Set(
    requests.map((r) => r.invitedEmail?.trim().toLowerCase()).filter((e): e is string => !!e),
  );
  return reviewInviteCandidates(clients.items, askedEmails);
}
