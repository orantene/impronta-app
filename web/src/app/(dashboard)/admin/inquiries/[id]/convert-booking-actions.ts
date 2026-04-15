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

  // Fire-and-forget booking confirmed emails to client + all active talent
  if (bookingId) {
    void (async () => {
      try {
        const adminClient = createServiceRoleClient();
        const { data: inq } = await supabase
          .from("inquiries")
          .select("contact_name, event_date, event_location, client_user_id")
          .eq("id", inquiryId)
          .maybeSingle();

        const contactName = (inq?.contact_name as string | null) ?? null;
        const eventDate = (inq?.event_date as string | null) ?? null;
        const eventLocation = (inq?.event_location as string | null) ?? null;

        // Email client
        if (inq?.client_user_id && adminClient) {
          const { data: authUser } = await adminClient.auth.admin.getUserById(inq.client_user_id as string);
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", inq.client_user_id)
            .maybeSingle();
          const clientEmail = authUser?.user?.email;
          if (clientEmail) {
            const tmpl = bookingConfirmedEmail({
              recipientName: clientProfile?.display_name ?? null,
              role: "client",
              bookingId,
              contactName,
              eventDate,
              eventLocation,
            });
            await sendEmail({ to: clientEmail, ...tmpl });
          }
        }

        // Email each active talent on the roster
        const { data: participants } = await supabase
          .from("inquiry_participants")
          .select("user_id, talent_profile_id, status, role")
          .eq("inquiry_id", inquiryId)
          .eq("role", "talent")
          .eq("status", "active");

        for (const p of participants ?? []) {
          const talentUserId = p.user_id as string | null;
          if (!talentUserId || !adminClient) continue;
          const { data: authUser } = await adminClient.auth.admin.getUserById(talentUserId);
          const { data: talentProfile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", talentUserId)
            .maybeSingle();
          const talentEmail = authUser?.user?.email;
          if (talentEmail) {
            const tmpl = bookingConfirmedEmail({
              recipientName: talentProfile?.display_name ?? null,
              role: "talent",
              bookingId,
              contactName,
              eventDate,
              eventLocation,
            });
            await sendEmail({ to: talentEmail, ...tmpl });
          }
        }
      } catch (err) {
        logServerError("actionEngineConvertToBooking/email", err);
      }
    })();
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
