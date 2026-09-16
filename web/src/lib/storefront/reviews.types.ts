/** reviews — carousel → grid of the workspace's published testimonials. */

export type ReviewsProps = {
  source?: "workspace";
  /** 1..50, default 6. */
  count?: number;
  layout?: "carousel" | "grid";
  locale?: string | null;
};

export type ReviewCard = {
  id: string;
  authorName: string;
  authorRole: string | null;
  body: string;
  rating: number | null;
  createdAtIso: string;
};

export type ReviewsData = {
  reviews: ReviewCard[];
  summary: { count: number; average: number | null };
  layout: "carousel" | "grid";
};
