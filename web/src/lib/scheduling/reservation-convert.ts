/**
 * Convert-time reservation enrichment.
 *
 * After engine_convert_to_booking (untouched), stamp agency_bookings
 * starts_at/ends_at/timezone, INSERT the talent_bookings mirror, and
 * delete the firm hold. Idempotent by inquiry_id. No-op when the inquiry
 * has no reservation stamp (M0 / non-appointment stays unchanged).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { parseReservationStamp } from "./reservation-intent";
import { releaseHoldsForInquiry } from "./reservation-hold";

export type EnrichBookingFromReservationResult =
  | { ok: true; applied: boolean }
  | { ok: false; error: string };

export async function enrichBookingFromReservation(
  admin: SupabaseClient,
  input: { inquiryId: string; bookingId: string; actorUserId?: string | null },
): Promise<EnrichBookingFromReservationResult> {
  if (!input.inquiryId || !input.bookingId) {
    return { ok: false, error: "Missing inquiry or booking." };
  }

  const { data: inquiry, error: inqErr } = await admin
    .from("inquiries")
    .select("id, tenant_id, source_context")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (inqErr) {
    logServerError("reservation-convert/inquiry", inqErr);
    return { ok: false, error: inqErr.message };
  }
  if (!inquiry) return { ok: true, applied: false };

  const stamp = parseReservationStamp(inquiry.source_context);
  if (!stamp) return { ok: true, applied: false };

  const { error: stampErr } = await admin
    .from("agency_bookings")
    .update({
      starts_at: stamp.starts_at,
      ends_at: stamp.ends_at,
      timezone: stamp.timezone,
    })
    .eq("id", input.bookingId);
  if (stampErr) {
    logServerError("reservation-convert/agency_bookings", stampErr);
    return { ok: false, error: stampErr.message };
  }

  const { data: existing } = await admin
    .from("talent_bookings")
    .select("id")
    .eq("inquiry_id", input.inquiryId)
    .maybeSingle();

  if (!existing) {
    const { data: offering, error: offErr } = await admin
      .from("talent_offerings")
      .select("id, talent_profile_id, title, tenant_id")
      .eq("id", stamp.offering_id)
      .maybeSingle();
    if (offErr) {
      logServerError("reservation-convert/offering", offErr);
      return { ok: false, error: offErr.message };
    }
    const talentProfileId = offering?.talent_profile_id;
    const tenantId = offering?.tenant_id ?? inquiry.tenant_id;
    if (!talentProfileId || !tenantId) {
      return { ok: false, error: "Reservation offering is missing a talent." };
    }

    const { error: insErr } = await admin.from("talent_bookings").insert({
      talent_profile_id: talentProfileId,
      tenant_id: tenantId,
      inquiry_id: input.inquiryId,
      title: (typeof offering?.title === "string" && offering.title.trim()) || "Reservation",
      starts_at: stamp.starts_at,
      ends_at: stamp.ends_at,
      all_day: false,
      status: "confirmed",
      created_by_user_id: input.actorUserId ?? null,
    });
    if (insErr) {
      // Unique inquiry_id: a concurrent retry already wrote the mirror.
      const dup = insErr.code === "23505" || (insErr.message ?? "").includes("talent_bookings_inquiry_id");
      if (!dup) {
        logServerError("reservation-convert/talent_bookings", insErr);
        return { ok: false, error: insErr.message };
      }
    }
  }

  if (stamp.hold_id) {
    const { error: holdErr } = await admin.from("talent_holds").delete().eq("id", stamp.hold_id);
    if (holdErr) logServerError("reservation-convert/hold_by_id", holdErr);
  }
  const released = await releaseHoldsForInquiry(admin, input.inquiryId);
  if (!released.ok) return released;

  return { ok: true, applied: true };
}
