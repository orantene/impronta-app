import type { BuilderReviewsNode } from "./types";

/** Default props for a freshly inserted `reviews` block (W-14). */
export const REVIEWS_DEFAULT_PROPS: BuilderReviewsNode["props"] = {
  layout: "row",
  eyebrow: "",
  title: "What clients say",
  limit: 12,
  showRating: true,
  autoplayMs: 5500,
  loop: true,
  showArrows: false,
  showDots: true,
  useWebsiteTheme: true,
};

export type ReviewsLayout = NonNullable<BuilderReviewsNode["props"]["layout"]>;

export const REVIEWS_LAYOUTS: readonly ReviewsLayout[] = [
  "trio",
  "single",
  "row",
] as const;
