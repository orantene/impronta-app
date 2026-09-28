/**
 * Load published talent reviews for the W-14 `reviews` widget.
 * Source of truth: `talent_reviews` via `loadTalentReviews`.
 * Never invents quotes; returns [] when none.
 */
import { loadTalentReviews } from "@/lib/reviews/load-reviews";
import { logServerError } from "@/lib/server/safe-error";

import type { TalentSiteReview } from "./reviews-types";

export async function loadReviewsSources(
  talentProfileId: string,
  limit = 12,
): Promise<{ talentReviews: TalentSiteReview[] }> {
  if (!talentProfileId) return { talentReviews: [] };
  try {
    const rows = await loadTalentReviews(talentProfileId, limit, 0);
    const talentReviews: TalentSiteReview[] = rows
      .map((r) => {
        const body = r.body?.trim() ?? "";
        if (!body) return null;
        return {
          id: r.id,
          body,
          clientName: r.clientName?.trim() || null,
          rating: r.rating,
          createdAt: r.createdAt,
        };
      })
      .filter((r): r is TalentSiteReview => r != null);
    return { talentReviews };
  } catch (err) {
    logServerError("reviews.loadTalentReviews", err);
    return { talentReviews: [] };
  }
}
