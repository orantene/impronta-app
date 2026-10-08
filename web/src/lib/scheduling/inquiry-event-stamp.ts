import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { isValidIanaTimeZone, utcToZonedYmd } from "./tz";

/**
 * TUL-132 — a talent-site booking mirrors into `talent_bookings`, but its
 * inquiry kept `event_date = null` and an empty `event_location`, so anything
 * reading the inquiry could not say when the appointment is. These helpers
 * stamp both from the booking, never overwriting what a person already set.
 */

/** First valid IANA zone of the candidates (talent hours, then workspace), else UTC. */
export function pickEventZone(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    if (typeof c === "string" && isValidIanaTimeZone(c.trim())) return c.trim();
  }
  return "UTC";
}

/** The booking's start date (YYYY-MM-DD) on the talent's wall clock, or null. */
export function eventDateForBooking(
  startsAtIso: string,
  ...zoneCandidates: Array<string | null | undefined>
): string | null {
  return utcToZonedYmd(new Date(startsAtIso), pickEventZone(...zoneCandidates));
}

/** Only fill gaps: the patch never contains a field the inquiry already has. */
export function buildInquiryEventPatch(
  current: { event_date?: string | null; event_location?: string | null },
  next: { eventDate: string | null; location: string | null },
): { event_date?: string; event_location?: string } {
  const patch: { event_date?: string; event_location?: string } = {};
  if (!current.event_date && next.eventDate) patch.event_date = next.eventDate;
  const loc = next.location?.trim();
  if (!(current.event_location ?? "").trim() && loc) patch.event_location = loc;
  return patch;
}

/** Best effort: a failure is logged and never fails the booking. */
export async function stampInquiryEventFromBooking(
  admin: SupabaseClient,
  input: {
    inquiryId: string;
    talentProfileId: string;
    tenantId: string;
    startsAt: string;
    locationText?: string | null;
  },
): Promise<void> {
  try {
    const { data: inq, error: inqErr } = await admin
      .from("inquiries")
      .select("event_date, event_location")
      .eq("id", input.inquiryId)
      .maybeSingle();
    if (inqErr) return void logServerError("inquiry-event-stamp/inquiry", inqErr);
    const current = (inq ?? null) as { event_date: string | null; event_location: string | null } | null;
    if (!current) return;
    if (current.event_date && (current.event_location ?? "").trim()) return;

    const { data: hours, error: hErr } = await admin
      .from("talent_booking_hours")
      .select("timezone")
      .eq("talent_profile_id", input.talentProfileId)
      .maybeSingle();
    if (hErr) logServerError("inquiry-event-stamp/hours", hErr);
    const { data: venue, error: vErr } = await admin
      .from("venues")
      .select("timezone")
      .eq("tenant_id", input.tenantId)
      .eq("is_default", true)
      .maybeSingle();
    if (vErr) logServerError("inquiry-event-stamp/venue", vErr);

    const patch = buildInquiryEventPatch(current, {
      eventDate: eventDateForBooking(
        input.startsAt,
        (hours as { timezone: string | null } | null)?.timezone,
        (venue as { timezone: string | null } | null)?.timezone,
      ),
      location: input.locationText ?? null,
    });
    if (Object.keys(patch).length === 0) return;
    const { error: upErr } = await admin.from("inquiries").update(patch).eq("id", input.inquiryId);
    if (upErr) logServerError("inquiry-event-stamp/update", upErr);
  } catch (e) {
    logServerError("inquiry-event-stamp", e);
  }
}
