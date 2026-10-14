/**
 * THE loader behind every public "when can I book?" answer: the slot picker's
 * `/api/public/booking/slots` and the AI-agent tools (TUL-21). Returns free
 * slot starts only — never raw holds, bookings, or blocks.
 *
 * Guards: published + public offering, host-tenant match, effective mode ≥
 * request (M1), the talent's own pause. Missing hours or a disabled policy
 * yield an empty list with a reason, not a guessed calendar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { resolveTalentBookingMode, type TalentBookingMode } from "@/lib/scheduling/booking-surface";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { loadBusyIntervals } from "@/lib/scheduling/load-busy";
import { computePublicSlots, type NoSlotsReason } from "@/lib/scheduling/public-slots";
import { cityLabelFromPlaceText } from "@/lib/scheduling/timezone-from-place";
import { addUtcDays, utcToZonedYmd } from "@/lib/scheduling/tz";
import { NOT_ACCEPTING_BOOKINGS } from "@/lib/talent/accepting-readiness";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";
import { demoPublicBookingHoursFallback } from "@/lib/talent-site/demos/demo-hours-fallback";

/**
 * Why there are no times.
 *
 * Every branch used to return the same `{"slots":[]}`, so "this talent has
 * never set hours", "this surface only takes inquiries" and "the day is full"
 * were one answer. An operator cannot act on that, and nobody can even tell it
 * is broken.
 */
export type OpenTimesReason =
  | NoSlotsReason
  | "not_bookable_here"
  | "inquiry_only"
  | "hours_unreadable"
  | "not_accepting_bookings";

export type PublicOpenTimesHost = {
  kind: string;
  tenantId: string | null;
  /** The talent a `talent_site` host serves (proxy-set header). */
  talentSiteId: string | null;
};

export type PublicOpenTimesResult =
  | {
      ok: true;
      slots: string[];
      timezone?: string;
      /** Talent's home city for the zone chip (Houston time, not Chicago time). */
      placeCity?: string | null;
      reason?: OpenTimesReason | null;
      /** Effective mode on this host, once it was resolved. */
      mode?: TalentBookingMode;
      talentProfileId?: string;
    }
  | { ok: false; status: 404 | 500; error: "not_found" | "query_failed" };

/** App and marketing hosts book too; agency and talent-site hosts must match. */
export const PUBLIC_BOOKING_HOST_KINDS = new Set(["agency", "talent_site", "hub", "app", "marketing"]);

export async function loadPublicOpenTimes(
  admin: SupabaseClient,
  input: {
    host: PublicOpenTimesHost;
    offeringId: string;
    from: Date;
    /** Already clamped by the caller. */
    days: number;
    /** Base + extras; null → the offering's own length. */
    parseDuration: (offeringDuration: number) => number;
    now: Date;
  },
): Promise<PublicOpenTimesResult> {
  const { host } = input;
  const notFound = { ok: false, status: 404, error: "not_found" } as const;
  const failed = { ok: false, status: 500, error: "query_failed" } as const;
  if (!PUBLIC_BOOKING_HOST_KINDS.has(host.kind)) return notFound;
  if (host.kind === "talent_site" && !host.talentSiteId) return notFound;

  const { data: offering, error: offeringErr } = await admin
    .from("talent_offerings")
    .select(
      "id, talent_profile_id, tenant_id, status, visibility, kind, booking_mode, reserve_mode, duration_minutes, attributes",
    )
    .eq("id", input.offeringId)
    .maybeSingle();
  if (offeringErr) {
    logServerError("api.public.booking.slots.offering", offeringErr);
    return failed;
  }
  if (
    !offering ||
    offering.status !== "published" ||
    offering.visibility !== "public" ||
    offering.kind === "product"
  ) {
    return notFound;
  }

  // A house-owned offering has no provider calendar here: answer with a
  // reason instead of a failed `eq("id", null)` read (TUL-77).
  if (!offering.talent_profile_id) return { ok: true, slots: [], reason: "not_bookable_here" };

  const { data: talent, error: talentErr } = await admin
    .from("talent_profiles")
    .select(
      "id, profile_code, profile_kind, booking_terms, created_by_agency_id, selling_defaults, is_demo, home_city_text",
    )
    .eq("id", offering.talent_profile_id)
    .maybeSingle();
  if (talentErr) {
    logServerError("api.public.booking.slots.talent", talentErr);
    return failed;
  }
  if (!talent) return notFound;

  const offeringTenantId =
    (typeof offering.tenant_id === "string" && offering.tenant_id) ||
    (typeof talent.created_by_agency_id === "string" && talent.created_by_agency_id) ||
    null;

  if (host.kind === "agency") {
    if (!offeringTenantId || offeringTenantId !== host.tenantId) return notFound;
  } else if (host.kind === "talent_site") {
    if (talent.id !== host.talentSiteId) return notFound;
  }

  const talentProfileId = talent.id as string;
  if (!offeringTenantId) return { ok: true, slots: [], reason: "not_bookable_here", talentProfileId };

  const mode = await resolveTalentBookingMode(admin, {
    talentProfileId,
    offeringId: offering.id,
    host: {
      kind: host.kind,
      tenantId: host.kind === "agency" || host.kind === "hub" ? host.tenantId : null,
    },
  });
  if (mode === "inquire") return { ok: true, slots: [], reason: "inquiry_only", mode, talentProfileId };

  // WSF-C §7: the talent's pause applies on their own site and the Tulala
  // profile (hub). An agency host owns its routing and is never paused here.
  if (host.kind !== "agency") {
    const switches = await loadTalentSiteSwitches(admin, talentProfileId);
    if (!switches.acceptingBookings) {
      return { ok: true, slots: [], reason: NOT_ACCEPTING_BOOKINGS, mode, talentProfileId };
    }
  }

  const { data: hoursRow, error: hoursErr } = await admin
    .from("talent_booking_hours")
    .select(
      "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
    )
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (hoursErr) {
    logServerError("api.public.booking.slots.hours", hoursErr);
    return failed;
  }

  let hours = parseBookingHours(hoursRow);
  if (!hours) {
    // TUL-539 / GRK-002: demos whose seed hours never landed still need a bookable
    // when-step. Real talents stay fail-closed (no invented calendar).
    const guess =
      typeof offering.duration_minutes === "number" && offering.duration_minutes > 0
        ? offering.duration_minutes
        : 60;
    hours = demoPublicBookingHoursFallback({
      isDemo: talent.is_demo === true,
      profileCode: typeof talent.profile_code === "string" ? talent.profile_code : null,
      homeCity: typeof talent.home_city_text === "string" ? talent.home_city_text : null,
      durationMinutes: guess,
    });
  }
  if (!hours) {
    // Two different failures. No row means nobody has configured hours. A row
    // that will not parse is a data defect, and it fails closed to zero slots
    // exactly like an unconfigured talent, which is how it stays invisible.
    return {
      ok: true,
      slots: [],
      reason: hoursRow ? "hours_unreadable" : "no_booking_hours",
      mode,
      talentProfileId,
    };
  }

  const horizon = Math.min(input.days, hours.horizonDays);
  const startYmd = utcToZonedYmd(input.from, hours.timezone) ?? input.from.toISOString().slice(0, 10);
  const endYmd = addUtcDays(startYmd, horizon) ?? startYmd;
  const windowEnd = new Date(`${endYmd}T23:59:59.999Z`);

  const busy = await loadBusyIntervals({
    admin,
    talentProfileId,
    from: input.from,
    to: windowEnd,
    now: input.now,
  });

  const attr = offering.attributes;
  const offeringBuffers =
    attr && typeof attr === "object" && !Array.isArray(attr)
      ? (attr as { bufferAfterMin?: unknown; bufferBeforeMin?: unknown })
      : null;
  const offeringDuration =
    typeof offering.duration_minutes === "number" && offering.duration_minutes > 0
      ? offering.duration_minutes
      : hours.slotMinutes;
  const { starts, reason } = computePublicSlots({
    hours,
    durationMinutes: input.parseDuration(offeringDuration),
    from: input.from,
    days: horizon,
    busy,
    sellingDefaults: talent.selling_defaults,
    offeringBufferAfterMin:
      typeof offeringBuffers?.bufferAfterMin === "number" ? offeringBuffers.bufferAfterMin : null,
    offeringBufferBeforeMin:
      typeof offeringBuffers?.bufferBeforeMin === "number" ? offeringBuffers.bufferBeforeMin : null,
  });
  const placeCity = cityLabelFromPlaceText(
    typeof talent.home_city_text === "string" ? talent.home_city_text : null,
  );
  return { ok: true, slots: starts, timezone: hours.timezone, placeCity, reason, mode, talentProfileId };
}
