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

/** AggregateRating / Review fields to merge onto the Service node; empty for a demo talent. */
export function serviceReviewsJsonLd(shown: ServiceReviews | null, demo: boolean): Record<string, unknown> {
  if (!shown || demo) return {};
  const out: Record<string, unknown> = {};
  if (shown.count > 0) {
    out.aggregateRating = { "@type": "AggregateRating", ratingValue: shown.average, reviewCount: shown.count, bestRating: 5, worstRating: 1 };
  }
  const named = shown.reviews.filter((x) => !x.demo && x.clientName);
  if (named.length) {
    out.review = named.map((x) => ({
      "@type": "Review",
      author: { "@type": "Person", name: x.clientName },
      reviewBody: x.body,
      datePublished: x.createdAt.slice(0, 10),
      reviewRating: { "@type": "Rating", ratingValue: x.rating, bestRating: 5, worstRating: 1 },
    }));
  }
  return out;
}
