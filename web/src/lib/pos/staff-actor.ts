import "server-only";

import { userHasCapability } from "@/lib/access";
import { cashierMayCancelSale } from "@/lib/pos/cancel-eligibility";
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

/**
 * PM 2026-10-21: a cashier may cancel only an unpaid draft with no payment in flight; anything
 * else needs booking.payment.request (manager+). Returns the refusal, or null when allowed.
 * Fails closed on any read error.
 */
export async function posCancelRefusal(
  g: { tenantId: string; admin: NonNullable<ReturnType<typeof createServiceRoleClient>> },
  orderId: string,
) {
  if (await userHasCapability("booking.payment.request", g.tenantId)) return null;
  const [orderRes, payRes] = await Promise.all([
    g.admin.from("orders").select("status").eq("id", orderId).eq("tenant_id", g.tenantId).maybeSingle(),
    g.admin.from("booking_transactions").select("status").eq("order_id", orderId),
  ]);
  const status = (orderRes.data as { status?: string } | null)?.status;
  const ok =
    !orderRes.error &&
    !payRes.error &&
    cashierMayCancelSale({ status, payments: (payRes.data ?? []) as Array<{ status: string }> });
  return ok ? null : { ok: false as const, error: "not_allowed" };
}
