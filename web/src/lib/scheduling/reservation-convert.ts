/**
 * Convert-time reservation enrichment.
 *
 * After engine_convert_to_booking (untouched), stamp agency_bookings
 * starts_at/ends_at/timezone, INSERT the talent_bookings mirror, and
 * delete the firm hold. Idempotent by inquiry_id.
 *
 * Window source (D-MSG-413 / remaining D-MSG-340 hole):
 *   1. reservation stamp on source_context (storefront / propose path), or
 *   2. a live talent_holds row for this inquiry (Messages client pick-time —
 *      places a hold but never writes a stamp).
 * No-op when neither exists (M0 / non-appointment stays unchanged).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { parseReservationStamp } from "./reservation-intent";
import { isExclusionViolation, releaseHoldsForInquiry } from "./reservation-hold";

export type EnrichBookingFromReservationResult =
  | { ok: true; applied: boolean }
  | { ok: false; error: string; reason?: "talent_double_booked" };

/** The talent + window we will mirror onto talent_bookings. */
export type AppointmentMirrorSource = {
  talentProfileId: string;
  tenantId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  title: string;
  holdId: string | null;
};

type LiveHoldRow = {
  id: string;
  talent_profile_id: string;
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  title: string | null;
  expires_at: string | null;
};

/**
 * Live firm hold for this inquiry, if any. Expired rows are ignored so a
 * lapsed pick-time cannot book a window the calendar no longer defends.
 */
export async function loadLiveHoldForInquiry(
  admin: SupabaseClient,
  inquiryId: string,
): Promise<{ ok: true; hold: LiveHoldRow | null } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("talent_holds")
    .select("id, talent_profile_id, tenant_id, starts_at, ends_at, title, expires_at")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) {
    logServerError("reservation-convert/live_hold", error);
    return { ok: false, error: error.message };
  }
  const now = Date.now();
  const rows = (data ?? []) as LiveHoldRow[];
  const live =
    rows.find((h) => {
      if (!h.talent_profile_id || !h.starts_at || !h.ends_at) return false;
      if (h.expires_at) {
        const exp = Date.parse(h.expires_at);
        if (Number.isFinite(exp) && exp <= now) return false;
      }
      const s = Date.parse(h.starts_at);
      const e = Date.parse(h.ends_at);
      return Number.isFinite(s) && Number.isFinite(e) && e > s;
    }) ?? null;
  return { ok: true, hold: live };
}

/**
 * Resolve the appointment window for confirm recheck + convert mirror.
 * Stamp wins; otherwise a live hold (Messages pick-time) supplies the window.
 */
export async function resolveAppointmentMirrorSource(
  admin: SupabaseClient,
  input: {
    inquiryId: string;
    tenantId: string | null;
    sourceContext: unknown;
    eventTimezone?: string | null;
  },
): Promise<
  | { ok: true; source: AppointmentMirrorSource | null }
  | { ok: false; error: string }
> {
  const stamp = parseReservationStamp(input.sourceContext);
  if (stamp) {
    const { data: offering, error: offErr } = await admin
      .from("talent_offerings")
      .select("id, talent_profile_id, title, tenant_id")
      .eq("id", stamp.offering_id)
      .maybeSingle();
    if (offErr) {
      logServerError("reservation-convert/resolve_offering", offErr);
      return { ok: false, error: offErr.message };
    }
    const talentProfileId = (offering as { talent_profile_id?: string | null } | null)?.talent_profile_id ?? null;
    const tenantId =
      (offering as { tenant_id?: string | null } | null)?.tenant_id ?? input.tenantId;
    if (!talentProfileId || !tenantId) {
      // Stamp without a talent cannot defend a calendar; fall through to hold.
    } else {
      const title =
        (typeof (offering as { title?: string | null } | null)?.title === "string" &&
          (offering as { title: string }).title.trim()) ||
        "Reservation";
      return {
        ok: true,
        source: {
          talentProfileId,
          tenantId,
          startsAt: stamp.starts_at,
          endsAt: stamp.ends_at,
          timezone: stamp.timezone,
          title,
          holdId: stamp.hold_id ?? null,
        },
      };
    }
  }

  const held = await loadLiveHoldForInquiry(admin, input.inquiryId);
  if (!held.ok) return held;
  if (!held.hold) {
    // A stamp whose offering has no talent, and no live hold to fall back to,
    // cannot defend the calendar — refuse rather than book undefended time.
    if (stamp) {
      return { ok: false, error: "Reservation offering is missing a talent." };
    }
    return { ok: true, source: null };
  }

  const timezone =
    (typeof input.eventTimezone === "string" && input.eventTimezone.trim()) || "UTC";
  return {
    ok: true,
    source: {
      talentProfileId: held.hold.talent_profile_id,
      tenantId: held.hold.tenant_id || input.tenantId || "",
      startsAt: new Date(held.hold.starts_at).toISOString(),
      endsAt: new Date(held.hold.ends_at).toISOString(),
      timezone,
      title: (held.hold.title && held.hold.title.trim()) || "Reservation",
      holdId: held.hold.id,
    },
  };
}

export async function enrichBookingFromReservation(
  admin: SupabaseClient,
  input: { inquiryId: string; bookingId: string; actorUserId?: string | null },
): Promise<EnrichBookingFromReservationResult> {
  if (!input.inquiryId || !input.bookingId) {
    return { ok: false, error: "Missing inquiry or booking." };
  }

  const { data: inquiry, error: inqErr } = await admin
    .from("inquiries")
    .select("id, tenant_id, source_context, event_timezone")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (inqErr) {
    logServerError("reservation-convert/inquiry", inqErr);
    return { ok: false, error: inqErr.message };
  }
  if (!inquiry) return { ok: true, applied: false };

  const resolved = await resolveAppointmentMirrorSource(admin, {
    inquiryId: input.inquiryId,
    tenantId: (inquiry as { tenant_id?: string | null }).tenant_id ?? null,
    sourceContext: (inquiry as { source_context?: unknown }).source_context,
    eventTimezone: (inquiry as { event_timezone?: string | null }).event_timezone ?? null,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const source = resolved.source;
  if (!source || !source.tenantId) return { ok: true, applied: false };

  const { error: stampErr } = await admin
    .from("agency_bookings")
    .update({
      starts_at: source.startsAt,
      ends_at: source.endsAt,
      timezone: source.timezone,
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
    const { error: insErr } = await admin.from("talent_bookings").insert({
      talent_profile_id: source.talentProfileId,
      tenant_id: source.tenantId,
      inquiry_id: input.inquiryId,
      title: source.title,
      starts_at: source.startsAt,
      ends_at: source.endsAt,
      all_day: false,
      status: "confirmed",
      created_by_user_id: input.actorUserId ?? null,
    });
    if (insErr) {
      // Unique inquiry_id: a concurrent retry already wrote the mirror.
      const dup = insErr.code === "23505" || (insErr.message ?? "").includes("talent_bookings_inquiry_id");
      if (!dup) {
        logServerError("reservation-convert/talent_bookings", insErr);
        // talent_bookings_no_overlap fired: this talent is already booked for
        // this window by another tenant or by staff on the calendar. Say that,
        // rather than handing a raw Postgres exclusion message to a person.
        if (isExclusionViolation(insErr)) {
          // `talent_bookings_no_overlap` is the one-talent-one-time truth
          // (SQLSTATE 23P01). The CALLER must refuse on this, never log and
          // carry on: a booking whose mirror was rejected is a double book
          // the calendar cannot see (D-MSG-312 / D-MSG-413).
          return {
            ok: false,
            reason: "talent_double_booked",
            error: "That time is already booked for this talent. Pick another time.",
          };
        }
        return { ok: false, error: insErr.message };
      }
    }
  }

  if (source.holdId) {
    const { error: holdErr } = await admin.from("talent_holds").delete().eq("id", source.holdId);
    if (holdErr) logServerError("reservation-convert/hold_by_id", holdErr);
  }
  const released = await releaseHoldsForInquiry(admin, input.inquiryId);
  if (!released.ok) {
    return { ok: false, error: released.error };
  }

  return { ok: true, applied: true };
}
