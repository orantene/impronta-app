import "server-only";

import { userHasCapability } from "@/lib/access";
import { requireInquiryManagerAction, requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type PosStaffCapability =
  | "operate_venue"
  | "booking.payment.request"
  | "booking.payment.refund"
  | "booking.payment.mark_received";

/**
 * Counter / floor staff gate (capability + service-role admin).
 * PM 2026-10-21: the sale path is `operate_venue` (editor and above), so a cashier seat can take sales.
 * Voiding a sale, the PIN list and the custom-amount limit pass `booking.payment.request` (manager+) explicitly;
 * discounts stay behind the TUL-1516 role limits, refunds behind `booking.payment.refund`.
 */
export async function posStaff(capability: PosStaffCapability = "operate_venue") {
  const guard = await requireWorkspaceStaffAction({ capability });
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
    // TUL-1742: forward the caller's capability to the staff fast-path only
    // (requireInquiryManagerAction never applies it to the appointed-
    // coordinator branch) — a bare call here let any staff member with just
    // `agency.workspace.view` slip through as "staff" and add POS lines,
    // the same bug class as TUL-1708's requireInquiryManagerAction P1 fix.
    const mgr = await requireInquiryManagerAction(inquiryId, { capability });
    if (mgr.ok) {
      const admin = createServiceRoleClient();
      if (!admin) return { ok: false as const, error: "unavailable" as const };
      return { ok: true as const, tenantId: mgr.tenantId, userId: mgr.user.id, tenantSlug: mgr.tenantSlug, admin };
    }
  }
  return posStaff(capability);
}
