import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { shapeMyReviews, type MyReviews, type ReviewRequestRow, type WrittenReviewRow } from "./my-reviews";

/** Every query is `client_user_id = session user` AND `tenant_id = this site's tenant`. */
export async function loadMyReviews(userId: string, tenantId: string): Promise<MyReviews> {
  const admin = createServiceRoleClient();
  if (!admin || !userId || !tenantId) return { written: [], toWrite: [] };
  const [written, requests] = await Promise.all([
    admin
      .from("talent_reviews")
      .select("id, rating, body, status, created_at, talent_profiles ( display_name )")
      .eq("client_user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("review_requests")
      .select("invite_token, status, created_at, talent_profiles ( display_name )")
      .eq("client_user_id", userId)
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (written.error) logServerError("clientAccount.reviews.written", written.error);
  if (requests.error) logServerError("clientAccount.reviews.requests", requests.error);
  return shapeMyReviews(
    written.error ? [] : ((written.data ?? []) as unknown as WrittenReviewRow[]),
    requests.error ? [] : ((requests.data ?? []) as unknown as ReviewRequestRow[]),
  );
}
