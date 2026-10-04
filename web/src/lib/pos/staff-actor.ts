import "server-only";

import { userHasCapability } from "@/lib/access";
import { requireInquiryManagerAction, requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type PosStaffCapability =
  | "booking.payment.request"
  | "booking.payment.refund"
  | "booking.payment.mark_received";

/** Counter / floor staff gate (capability + service-role admin). */
export async function posStaff(capability: PosStaffCapability = "booking.payment.request") {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability(capability, guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, tenantSlug: guard.tenantSlug, admin };
}

/**
 * Messages items picker may pass `inquiryId` so an appointed talent
 * coordinator can add a line; counter omits it and stays on `posStaff`.
 */
export async function posStaffOrInquiryManager(
  inquiryId: string | null | undefined,
  capability: PosStaffCapability = "booking.payment.request",
) {
  if (inquiryId) {
    const mgr = await requireInquiryManagerAction(inquiryId);
    if (mgr.ok) {
      const admin = createServiceRoleClient();
      if (!admin) return { ok: false as const, error: "unavailable" as const };
      return { ok: true as const, tenantId: mgr.tenantId, userId: mgr.user.id, tenantSlug: mgr.tenantSlug, admin };
    }
  }
  return posStaff(capability);
}
