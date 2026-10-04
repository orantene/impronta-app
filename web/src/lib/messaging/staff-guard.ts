import "server-only";

import { requireInquiryManagerAction, requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * The Messages actions' guard: workspace staff, plus the service client the
 * readers use. One shape for `messaging-engine.ts` and `messaging-sheets.ts`.
 */
export async function messagingStaff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return {
    ok: true as const,
    tenantId: guard.tenantId,
    // S6: `messagingRecordOutsidePayment`'s workspace-booking path wraps
    // `markInquiryPaidInCash(tenantSlug, ...)`, which is keyed on the slug,
    // not the tenant id. Additive — every existing caller ignores it.
    tenantSlug: guard.tenantSlug,
    userId: guard.user.id,
    admin,
    supabase: guard.supabase,
  };
}

/**
 * Inquiry manager (staff OR active coordinator) with service-role admin.
 * Staff fallback when the manager gate fails — admin Messages without a
 * coordinator row. Used by shared-draft (and peers) so talent `/talent/inbox`
 * coordinators are not refused with `not_allowed`.
 */
export async function messagingInquiryManager(inquiryId: string) {
  const mgr = await requireInquiryManagerAction(inquiryId);
  if (mgr.ok) {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false as const, reason: "unavailable" as const };
    return {
      ok: true as const,
      tenantId: mgr.tenantId,
      tenantSlug: mgr.tenantSlug,
      userId: mgr.user.id,
      admin,
      supabase: mgr.supabase,
      isStaff: mgr.isStaff,
    };
  }
  return messagingStaff();
}
