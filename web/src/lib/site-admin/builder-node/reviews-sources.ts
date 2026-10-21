/**
 * Load published talent reviews for the W-14 `reviews` widget.
 * Source of truth: `talent_reviews` via `loadTalentReviews`.
 * Never invents quotes; returns [] when none.
 */
import { collectiveTenantIdsOwnedByTalent, loadWorkspaceReviews, mergeOwnerPageReviews } from "@/lib/reviews/collective-reviews";
import { loadTalentReviews } from "@/lib/reviews/load-reviews";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import type { TalentSiteReview } from "./reviews-types";

export async function loadReviewsSources(
  talentProfileId: string,
  limit = 12,
): Promise<{ talentReviews: TalentSiteReview[] }> {
  if (!talentProfileId) return { talentReviews: [] };
  try {
    const own = await loadTalentReviews(talentProfileId, limit, 0);
    // TUL-1467: a Friends collective's owner collects the whole group's reviews on her page (quote + rating only).
    let rows = own;
    const ownerDb = createServiceRoleClient();
    if (ownerDb) {
      const owned = await collectiveTenantIdsOwnedByTalent(ownerDb, talentProfileId);
      if (owned.length > 0) {
        const groups = await Promise.all(owned.map((t) => loadWorkspaceReviews(ownerDb, t, limit)));
        const asOwnerReviews = groups.flat().map((w) => ({ id: w.id, body: w.body, rating: w.rating, createdAt: w.createdAt, clientName: null as string | null }));
        const own2 = own.map((o) => ({ id: o.id, body: o.body, rating: o.rating, createdAt: o.createdAt, clientName: o.clientName ?? null }));
        rows = mergeOwnerPageReviews(own2, asOwnerReviews, limit) as unknown as typeof own;
      }
    }
    // A demo talent's reviews are labelled as demo on every card.
    let demo = false;
    if (rows.length) {
      const admin = createServiceRoleClient();
      const { data } = admin
        ? await admin.from("talent_profiles").select("is_demo").eq("id", talentProfileId).maybeSingle()
        : { data: null };
      demo = (data as { is_demo?: boolean } | null)?.is_demo === true;
    }
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
          ...(demo ? { demo: true } : {}),
        };
      })
      .filter((r): r is TalentSiteReview => r != null);
    return { talentReviews };
  } catch (err) {
    logServerError("reviews.loadTalentReviews", err);
    return { talentReviews: [] };
  }
}
