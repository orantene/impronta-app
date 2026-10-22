import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { shapeMyReviews, type MyReviews, type ReviewRequestRow, type WrittenReviewRow } from "./my-reviews";

/**
 * Every query is `client_user_id = session user`. On a site with its own tenant it is also
 * `tenant_id = this site's tenant`; `tenantId = null` (hub / app / marketing hosts, the client's
 * whole account) lists their reviews and open requests across tenants.
 */
export async function loadMyReviews(userId: string, tenantId: string | null): Promise<MyReviews> {
  const admin = createServiceRoleClient();
  if (!admin || !userId) return { written: [], toWrite: [] };
  let writtenQuery = admin
    .from("talent_reviews")
    .select("id, rating, body, status, created_at, talent_profiles ( display_name )")
    .eq("client_user_id", userId)
    .eq("status", "published");
  let requestsQuery = admin
    .from("review_requests")
    .select("invite_token, status, created_at, talent_profiles ( display_name )")
    .eq("client_user_id", userId)
    .in("status", ["pending", "sent"]);
  if (tenantId) {
    writtenQuery = writtenQuery.eq("tenant_id", tenantId);
    requestsQuery = requestsQuery.eq("tenant_id", tenantId);
  }
  const [written, requests] = await Promise.all([
    writtenQuery.order("created_at", { ascending: false }).limit(50),
    requestsQuery.order("created_at", { ascending: false }).limit(20),
  ]);
  if (written.error) logServerError("clientAccount.reviews.written", written.error);
  if (requests.error) logServerError("clientAccount.reviews.requests", requests.error);
  return shapeMyReviews(
    written.error ? [] : ((written.data ?? []) as unknown as WrittenReviewRow[]),
    requests.error ? [] : ((requests.data ?? []) as unknown as ReviewRequestRow[]),
  );
}
