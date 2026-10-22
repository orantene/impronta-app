/**
 * TUL-1328: per-business owner switch for the AUTOMATIC review-request email,
 * distinct from `tenantReviewsEnabled` (whether reviews show at all). A
 * business can keep manual review requests and public review display while
 * opting out of the automatic post-booking nag.
 *
 * `agency_entitlements.auto_review_requests_enabled` (migration
 * `20261231425200`, held). Opt-out model: no row, or an explicit `true`,
 * means on. Unlike `tenantReviewsEnabled`, an unresolvable read fails CLOSED
 * here (no automatic email goes out this run), matching every other guard in
 * `auto-review-request.ts` — a side-effecting send is worse to get wrong than
 * a public read.
 *
 * Plain server module (not "use server") so it can be imported alongside
 * `reviews-entitlement.ts`.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function tenantAutoReviewRequestsEnabled(
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (!tenantId) return false;
  const svc = createServiceRoleClient();
  if (!svc) return false;
  try {
    const { data, error } = await svc
      .from("agency_entitlements")
      .select("auto_review_requests_enabled")
      .eq("tenant_id", tenantId)
      .returns<{ auto_review_requests_enabled: boolean | null }[]>()
      .maybeSingle();
    if (error) return false;
    // No row → no owner decision → the opt-out default (on). Explicit `false` → off.
    if (!data || data.auto_review_requests_enabled == null) return true;
    return data.auto_review_requests_enabled !== false;
  } catch {
    return false;
  }
}
