"use server";

/**
 * Staff-only moderation of INDIVIDUAL review photos (STANDING v3 item 5).
 *
 * A photo attached to a client→talent review defaults to
 * approval_state='approved' (migration 20261110120000: `DEFAULT 'approved'`),
 * and the public profile shows only `deleted_at IS NULL AND
 * approval_state='approved'` rows (web/src/lib/reviews/load-reviews.ts). So a
 * freshly uploaded photo is live immediately; this action exists to let staff
 * REJECT (hide) a bad photo and RESTORE it later — WITHOUT hiding the whole
 * review, which was the previous all-or-nothing behaviour.
 *
 * Auth path: service-role write AFTER an explicit app-side staff check
 * (requireStaffTenantAction), mirroring actionSetApprovalState in
 * web/src/app/(workspace)/[tenantSlug]/admin/media/actions.ts. This needs no new
 * RLS policy (a `talent_review_media_staff_all` policy already exists, but the
 * service-role + app-check path is the lower-risk, no-migration choice and does
 * not depend on RLS join correctness). Every write is scoped to the caller's
 * tenant via an explicit `.eq("tenant_id", tenantId)` filter, so cross-tenant
 * moderation is impossible even if a foreign mediaId is passed.
 */

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Set one review photo's approval_state. `"approved"` doubles as RESTORE (bring
 * a previously rejected photo back to public). Staff of the media row's tenant
 * only; tenant-scoped write.
 */
export async function setReviewMediaApprovalState(
  mediaId: string,
  state: "approved" | "rejected",
): Promise<ActionResult<{ approvalState: string }>> {
  const id = (mediaId ?? "").trim();
  if (!id) return { ok: false, error: "Missing photo id." };
  if (state !== "approved" && state !== "rejected") {
    return { ok: false, error: "Invalid state." };
  }

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId, tenantSlug } = auth;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Tenant-scoped update. If the row belongs to another tenant, the filter
  // matches nothing (count 0) and nothing is moderated cross-tenant.
  const { data, error } = await admin
    .from("talent_review_media")
    .update({ approval_state: state })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .select("id, review_id")
    .maybeSingle<{ id: string; review_id: string }>();

  if (error) {
    logServerError("reviews.media.moderation.setState", error);
    return { ok: false, error: "Could not update. Try again." };
  }
  if (!data) {
    // No row for this tenant — either a bad id or a cross-tenant attempt.
    return { ok: false, error: "Photo not found on this workspace." };
  }

  // Refresh the admin surface immediately.
  revalidatePath(`/${tenantSlug}/admin/reviews/media`);

  // Best-effort: refresh the affected public talent profile page so the photo
  // appears/disappears. load-reviews is a live read (no cache tag), so this
  // only matters if the route is statically/segment cached. review_id →
  // talent_profiles.profile_code → /t/{code}.
  try {
    const { data: review } = await admin
      .from("talent_reviews")
      .select("talent_profile_id")
      .eq("id", data.review_id)
      .maybeSingle<{ talent_profile_id: string | null }>();
    if (review?.talent_profile_id) {
      const { data: profile } = await admin
        .from("talent_profiles")
        .select("profile_code")
        .eq("id", review.talent_profile_id)
        .maybeSingle<{ profile_code: string | null }>();
      if (profile?.profile_code) {
        revalidatePath(`/t/${profile.profile_code}`);
      }
    }
  } catch (e) {
    logServerError("reviews.media.moderation.revalidateProfile", e);
  }

  return { ok: true, data: { approvalState: state } };
}
