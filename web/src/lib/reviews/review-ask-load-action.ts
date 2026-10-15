"use server";

/**
 * TUL-981: one round-trip for the "Ask for a review" card's booking picker.
 *
 * Server actions called from the same client run one after another, so three
 * separate calls (reviewables, filed invites, clients) stacked up to ~3 s on
 * staging. The picker only needs the first two; they run in parallel here and
 * the heavier client list loads afterwards without holding the card.
 */

import { loadClientReviewablesAction } from "@/lib/reviews/review-actions";
import {
  loadReviewRequestsForOwnerAction,
  type ReviewRequestSummary,
} from "@/lib/reviews/review-request-actions";
import type { ReviewableCounterparty } from "@/lib/reviews/review-types";

export async function loadReviewAskBookingsAction(
  tenantSlug: string,
  talentProfileId: string,
): Promise<{ reviewables: ReviewableCounterparty[]; requests: ReviewRequestSummary[] }> {
  const [reviewables, requests] = await Promise.all([
    loadClientReviewablesAction(tenantSlug),
    loadReviewRequestsForOwnerAction(tenantSlug, talentProfileId),
  ]);
  return { reviewables, requests };
}
