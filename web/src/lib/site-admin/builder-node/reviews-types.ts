/**
 * Live review DTO for the W-14 `reviews` builder node.
 * Resolved server-side from `talent_reviews` via `loadTalentReviews`.
 * The renderer never queries and never invents quotes.
 */
export type TalentSiteReview = {
  id: string;
  /** Quote body; empty reviews are filtered out before render. */
  body: string;
  /** First name when the reviewer is not anonymous; null otherwise. */
  clientName: string | null;
  rating: number;
  createdAt: string;
  /** True on a demo talent's site: the card says "Demo review". */
  demo?: boolean;
};
