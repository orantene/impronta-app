import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { toJsonLdReviews, type TalentJsonLdReviews } from "@/lib/seo/talent-json-ld";

/**
 * TUL-585: the reviews the profile JSON-LD may state. Rating markup is emitted only
 * when reviews really exist AND the page shows them (reviews enabled for the surface,
 * at least one published review row) and the talent is not a demo. The demo lookup runs
 * only for pages that have reviews, and an unavailable service client or a lookup error
 * means no markup (fail closed: unproven markup is worse than none).
 */
export async function loadProfileReviewsJsonLd(args: {
  profileId: string;
  reviewsEnabled: boolean;
  summary: { average: number; count: number };
  rows: readonly { rating: number; body: string | null; clientName: string | null; createdAt: string }[];
}): Promise<TalentJsonLdReviews | null> {
  if (!args.reviewsEnabled || args.summary.count < 1 || args.rows.length === 0) return null;
  const db = createServiceRoleClient();
  if (!db) return null;
  const { data, error } = await db.from("talent_profiles").select("is_demo").eq("id", args.profileId).maybeSingle();
  if (error) {
    logServerError("seo.profileReviewsLd.demo", error);
    return null;
  }
  if (!data || (data as { is_demo?: boolean | null }).is_demo !== false) return null;
  return toJsonLdReviews(args.summary, args.rows);
}
