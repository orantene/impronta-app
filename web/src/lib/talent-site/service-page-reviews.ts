/**
 * TUL-795: reviews on a talent service page. Pure (no DB) so render and tests share it.
 * Data: the talent's published reviews (`loadReviewsSources`, body required) and the public
 * rating summary (`loadTalentRatingSummary`). Reviews are talent-level, not per service.
 * JSON-LD carries only what the page shows, and nothing on a demo talent.
 */
import type { TalentSiteReview } from "@/lib/site-admin/builder-node/reviews-types";

export const SERVICE_REVIEWS_MAX = 3;

export type ServiceReviews = { average: number; count: number; reviews: TalentSiteReview[] };

export function serviceReviewsCopy(locale: string): {
  heading: string;
  count: (n: number) => string;
  demo: string;
  anonymous: string;
} {
  return locale.toLowerCase().startsWith("en")
    ? { heading: "Reviews", count: (n) => (n === 1 ? "1 review" : `${n} reviews`), demo: "Demo review", anonymous: "Client" }
    : { heading: "Reseñas", count: (n) => (n === 1 ? "1 reseña" : `${n} reseñas`), demo: "Reseña de demostración", anonymous: "Cliente" };
}

/** What the page shows: the aggregate only with a real count, up to 3 reviews with a body. */
export function shownServiceReviews(r: ServiceReviews | null | undefined): ServiceReviews | null {
  if (!r) return null;
  const reviews = r.reviews.filter((x) => x.body.trim() !== "").slice(0, SERVICE_REVIEWS_MAX);
  const hasAgg = r.count > 0 && r.average > 0;
  if (!hasAgg && reviews.length === 0) return null;
  return { average: hasAgg ? r.average : 0, count: hasAgg ? r.count : 0, reviews };
}

// Service JSON-LD carries NO review markup (talent-wide reviews are not about one service; self-served
// Review/AggregateRating reads as self-review). The page still shows them.
