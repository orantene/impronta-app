"use server";

/**
 * inquiry-cancel-actions.ts — client-side cancel-inquiry action.
 *
 * B3 (booking cancellation / reschedule) — first slice: cancel an
 * inquiry that hasn't yet booked. Calls engine `clientCancelInquiry`
 * which maps to `status='rejected'` + `close_reason='client_cancelled'`
 * (lifecycle has no separate "cancelled" status).
 *
 * Allowed from submitted / coordination / offer_pending / approved.
 * Blocked from booked — that needs a separate cancellation flow with
 * refund / talent release semantics.
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { clientCancelInquiry } from "@/lib/inquiry/inquiry-engine";
import { logServerError } from "@/lib/server/safe-error";

export type CancelInquiryResult =
  | { ok: true }
  | { ok: false; error: string };

export async function cancelInquiryAsClient(
  tenantSlug: string,
  inquiryId: string,
  reason: string | null,
): Promise<CancelInquiryResult> {
  try {
    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return { ok: false, error: "Not authenticated." };

    const scope = await getTenantPortalScopeBySlug(tenantSlug);
    if (!scope) return { ok: false, error: "Tenant not found." };

    // Look up inquiry + verify client ownership + grab version for the
    // optimistic-lock UPDATE inside the engine.
    const admin = createServiceRoleClient();
    const read = admin ?? session.supabase;
    const { data: inq, error: lookupErr } = await read
      .from("inquiries")
      .select("id, client_user_id, version, status")
      .eq("id", inquiryId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (lookupErr || !inq) return { ok: false, error: "Inquiry not found." };
    if (inq.client_user_id !== session.user.id) {
      return { ok: false, error: "Not authorised to cancel this inquiry." };
    }
    if (inq.status === "booked" || inq.status === "converted") {
      return {
        ok: false,
        error: "This booking is already confirmed — message your coordinator to cancel.",
      };
    }

    const result = await clientCancelInquiry(read, {
      inquiryId,
      tenantId: scope.tenantId,
      actorUserId: session.user.id,
      expectedVersion: inq.version as number,
      reason: reason?.trim() || null,
    });

    if (!result.success) {
      if (result.forbidden) return { ok: false, error: "Not authorised to cancel." };
      if (result.reason === "inquiry_frozen") return { ok: false, error: "Inquiry is frozen — message your coordinator." };
      if (result.reason === "invalid_status_transition") return { ok: false, error: "Cannot cancel from current status." };
      return { ok: false, error: result.error ?? "Cancel failed." };
    }

    revalidatePath(`/${tenantSlug}/client/inquiries`);
    revalidatePath(`/${tenantSlug}/client/messages`);
    return { ok: true };
  } catch (err) {
    logServerError("client.cancelInquiry", err);
    return { ok: false, error: "Unexpected error." };
  }
}
