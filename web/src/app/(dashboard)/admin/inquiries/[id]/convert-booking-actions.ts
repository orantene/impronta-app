"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { convertToBooking } from "@/lib/inquiry/inquiry-engine";
import { requireStaff } from "@/lib/server/action-guards";

export async function actionEngineConvertToBooking(formData: FormData): Promise<void> {
  const auth = await requireStaff();
  if (!auth.ok) {
    redirect("/admin/inquiries");
  }
  const { supabase, user } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const expectedVersion = Number(formData.get("expected_version") ?? "1");

  if (!inquiryId) {
    redirect(`/admin/inquiries?convert_error=${encodeURIComponent("Missing inquiry.")}`);
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
    redirect(`/admin/inquiries/${inquiryId}?convert_error=${encodeURIComponent(msg)}`);
  }

  const bookingId = res.data?.bookingId;
  revalidatePath(`/admin/inquiries/${inquiryId}`);
  revalidatePath("/admin/bookings");
  if (bookingId) {
    redirect(`/admin/bookings/${bookingId}`);
  }
  redirect(`/admin/inquiries/${inquiryId}`);
}
