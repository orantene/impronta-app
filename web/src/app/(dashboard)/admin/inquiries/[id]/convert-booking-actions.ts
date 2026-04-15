"use server";

import { revalidatePath } from "next/cache";
import { convertToBooking } from "@/lib/inquiry/inquiry-engine";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireStaff } from "@/lib/server/action-guards";
import { sendBookingConfirmedNotifications } from "@/lib/email/inquiry-notifications";

export type ConvertBookingSuccess = { bookingId: string };

export async function actionEngineConvertToBooking(
  formData: FormData,
): Promise<ActionResult<ConvertBookingSuccess>> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: "You do not have access to convert this inquiry." };
  }
  const { supabase, user } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId) {
    return { ok: false, code: "validation_error", message: "Missing inquiry." };
  }

  const res = await convertToBooking(supabase, {
    inquiryId,
    actorUserId: user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
  });

  if (!res.success) {
    const msg =
      res.reason === "roster_offer_mismatch"
        ? "Roster changed since the offer was sent. Send a new offer."
        : res.reason === "approvals_incomplete"
          ? "All approvals must be complete before booking."
          : res.reason === "no_active_offer"
            ? "No accepted offer — complete approvals first."
            : res.conflict
              ? "This inquiry was updated. Refresh and try again."
              : res.error ?? "Could not convert to booking.";
    return res.conflict
      ? { ok: false, code: "version_conflict", message: msg }
      : { ok: false, code: "precondition_failed", message: msg };
  }

  const bookingId = res.data?.bookingId;
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  revalidatePath("/admin/bookings");

  if (bookingId) {
    void sendBookingConfirmedNotifications({ supabase, inquiryId, bookingId });
  }

  if (!bookingId) {
    return {
      ok: true,
      message: "Booking created. Refresh if the linked booking does not appear.",
    };
  }
  return {
    ok: true,
    data: { bookingId },
    message: "Converted to booking.",
  };
}
