/**
 * TUL-1317 slice 2: pure shaping for "My reviews" in `/account`.
 *  - reviews THIS client wrote (published only: a hidden one is a moderation decision, not listed);
 *  - review requests still waiting (`pending` or `sent`), as a "Leave a review" link that reuses
 *    `/review/<token>` (the same page and server action the email link opens).
 */
export type WrittenReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  status: string;
  created_at: string;
  talent_profiles: { display_name: string | null } | null;
};
export type ReviewRequestRow = {
  invite_token: string | null;
  status: string;
  created_at: string;
  talent_profiles: { display_name: string | null } | null;
};

export type MyReviews = {
  written: Array<{ id: string; rating: number; body: string | null; who: string | null; createdAt: string }>;
  toWrite: Array<{ href: string; who: string | null }>;
};

export function shapeMyReviews(written: readonly WrittenReviewRow[], requests: readonly ReviewRequestRow[]): MyReviews {
  return {
    written: [...written]
      .filter((r) => r.status === "published")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => ({
        id: r.id,
        rating: Math.min(5, Math.max(1, Math.round(Number(r.rating) || 1))),
        body: r.body?.trim() || null,
        who: r.talent_profiles?.display_name?.trim() || null,
        createdAt: r.created_at,
      })),
    toWrite: [...requests]
      .filter((r) => (r.status === "pending" || r.status === "sent") && r.invite_token?.trim())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => ({ href: `/review/${encodeURIComponent(r.invite_token!.trim())}`, who: r.talent_profiles?.display_name?.trim() || null })),
  };
}
