/**
 * Instant-book plan ceiling + reservation stamp helper (P2 / M2).
 * PURE. The engine refuses before it touches money or the calendar.
 */

import {
  appointmentModeRank,
  getAppointmentsPlanPolicy,
  type AppointmentMode,
} from "./appointments-plan-policy";
import {
  RESERVATION_STAMP_VERSION,
  type ReservationStamp,
} from "./reservation-intent";
import type { WeekdayIndex, WeeklyHours } from "./hours-types";
import {
  parseBookingPosture,
  PLATFORM_DEFAULT_BOOKING_POSTURE,
} from "@/lib/talent/selling-booking-settings";

/**
 * Master "is this person taking new bookings at all" switch
 * (`talent_sites.accepting_bookings`, read through loadTalentSiteSwitches).
 * Evaluated BEFORE the per-offering mode. Missing / null = accepting.
 */
export function assertAcceptingNewBookings(
  accepting?: boolean | null,
): { ok: true } | { ok: false; reason: "not_accepting_bookings" } {
  return accepting === false ? { ok: false, reason: "not_accepting_bookings" } : { ok: true };
}

export type EffectiveBookingMode = {
  mode: "instant" | "request" | "inquiry" | "closed";
  /** Where the mode came from. `readiness` = instant fell back to request. */
  source: "master" | "offering" | "default" | "platform" | "readiness";
};

/** A service's own stored mode: explicit value, or null = inherit the default. */
export function parseOfferingBookingMode(raw: unknown): "instant" | "request" | "inquiry" | null {
  return raw === "instant" || raw === "request" || raw === "inquiry" ? raw : null;
}

/**
 * F4 / WSF-B — THE effective booking mode of one offering. Every reader (the
 * CTA derivation, the slots route, booking surface, instant-purchase) goes
 * through this; there is no second resolver.
 *
 * Precedence (product rules §1):
 *   1. master restriction (`accepting === false`) → closed
 *   2. the service's own mode, when set (`talent_offerings.booking_mode`
 *      non-null: instant | request | inquiry)
 *   3. the talent default (`selling_defaults.bookingPosture`; legacy
 *      `on_demand` reads as instant, see parseBookingPosture)
 *   4. the platform default (instant, the old on_demand fallback)
 * Then readiness: an effective instant needs working hours, a duration, a
 * delivery method and, for money at booking, payouts. When the caller says
 * it is not ready, instant falls back to request (`source: "readiness"`).
 * Callers that do not pass `readiness` get the mode unchanged.
 *
 * `defaults` is the raw selling_defaults blob or an already-parsed
 * `{ bookingPosture }`; both go through the same parser.
 */
export function resolveEffectiveBookingMode(input: {
  offering: { bookingMode: string | null | undefined };
  defaults: unknown;
  accepting?: boolean | null;
  readiness?: { instantReady: boolean } | null;
}): EffectiveBookingMode {
  if (!assertAcceptingNewBookings(input.accepting).ok) return { mode: "closed", source: "master" };
  let resolved: EffectiveBookingMode;
  const own = parseOfferingBookingMode(input.offering.bookingMode);
  if (own) {
    resolved = { mode: own, source: "offering" };
  } else {
    const raw =
      input.defaults && typeof input.defaults === "object" && !Array.isArray(input.defaults)
        ? (input.defaults as Record<string, unknown>).bookingPosture
        : undefined;
    const posture = parseBookingPosture(raw);
    resolved = posture
      ? { mode: posture, source: "default" }
      : { mode: PLATFORM_DEFAULT_BOOKING_POSTURE, source: "platform" };
  }
  if (resolved.mode === "instant" && input.readiness && input.readiness.instantReady === false) {
    return { mode: "request", source: "readiness" };
  }
  return resolved;
}

export type InstantPostureGate =
  | { ok: true }
  | { ok: false; reason: "inquiry_only" | "request_only" | "not_accepting_bookings"; error: string };

/**
 * Server refusal of an instant booking whose EFFECTIVE mode is not instant,
 * whatever the page sent. The till (`staffDesk`) is exempt: staff are the
 * confirmation for a walk-in.
 */
export function assertInstantPosture(input: {
  sellingDefaults: unknown;
  bookingMode: string | null | undefined;
  staffDesk: boolean;
  /** `talent_sites.accepting_bookings`; pass only on a direct channel (§7). */
  accepting?: boolean | null;
  /** §1 row 4: not ready means instant falls back to request. */
  readiness?: { instantReady: boolean } | null;
}): InstantPostureGate {
  if (input.staffDesk) return { ok: true };
  const effective = resolveEffectiveBookingMode({
    offering: { bookingMode: input.bookingMode },
    defaults: input.sellingDefaults,
    accepting: input.accepting,
    readiness: input.readiness,
  });
  if (effective.mode === "instant") return { ok: true };
  if (effective.mode === "closed") {
    return {
      ok: false,
      reason: "not_accepting_bookings",
      error: "Not taking new bookings right now. Send an inquiry instead.",
    };
  }
  return {
    ok: false,
    reason: effective.mode === "inquiry" ? "inquiry_only" : "request_only",
    error: "This one is booked by request. Send a message to ask for a time.",
  };
}

export type InstantPlanGate =
  | { ok: true }
  | {
      ok: false;
      reason: "plan_lacks_capability";
      maxMode: AppointmentMode;
      requiredMode: "instant";
    };

export function assertInstantPlanCeiling(
  planTier: string | null | undefined,
): InstantPlanGate {
  const plan = getAppointmentsPlanPolicy(planTier);
  if (appointmentModeRank(plan.maxMode) >= appointmentModeRank("instant")) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "plan_lacks_capability",
    maxMode: plan.maxMode,
    requiredMode: "instant",
  };
}

export type InstantReservationWindow = {
  startsAt: string;
  endsAt: string;
  timezone: string;
};

export function reservationStampForInstant(input: {
  offeringId: string;
  window: InstantReservationWindow;
  durationMinutes: number;
  holdId?: string | null;
  holdExpiresAt?: string | null;
}): ReservationStamp {
  return {
    v: RESERVATION_STAMP_VERSION,
    offering_id: input.offeringId,
    starts_at: new Date(input.window.startsAt).toISOString(),
    ends_at: new Date(input.window.endsAt).toISOString(),
    timezone: input.window.timezone,
    duration_minutes: input.durationMinutes,
    mode: "instant",
    hold_id: input.holdId ?? null,
    hold_expires_at: input.holdExpiresAt ?? null,
  };
}

/**
 * A timed service with real hours must not confirm on the no-window path.
 * Products and offerings with no duration or no hours keep today's behavior.
 */
export function instantRequiresSlot(input: {
  kind: string | null | undefined;
  durationMinutes: number | null | undefined;
  hasBookableHours: boolean;
}): boolean {
  if (input.kind === "product") return false;
  if ((input.durationMinutes ?? 0) <= 0) return false;
  return input.hasBookableHours === true;
}

export function weeklyHasBookableWindow(weekly: WeeklyHours | null): boolean {
  if (!weekly) return false;
  for (let day = 0; day <= 6; day++) {
    if ((weekly[day as WeekdayIndex] ?? []).length > 0) return true;
  }
  return false;
}

/** Distinct from "A time was requested." Terminology-aware. */
export function instantReservationConfirmedBody(
  singular: string,
  locale: "en" | "es",
): string {
  const noun = singular.trim() || (locale === "es" ? "reserva" : "reservation");
  return locale === "es"
    ? `Tu ${noun} esta confirmada.`
    : `Your ${noun} is confirmed.`;
}

/**
 * Effective min-notice minutes — same overlay order as `applySellingTimeToHours`
 * (selling defaults win over the hours row when set).
 */
export function resolveEffectiveMinNoticeMin(input: {
  hoursMinNoticeMin: number | null | undefined;
  sellingDefaults: unknown;
}): number {
  const raw =
    input.sellingDefaults &&
    typeof input.sellingDefaults === "object" &&
    !Array.isArray(input.sellingDefaults)
      ? (input.sellingDefaults as Record<string, unknown>)
      : null;
  const fromDefaults =
    raw && typeof raw.minNoticeMin === "number" && Number.isFinite(raw.minNoticeMin)
      ? Math.max(0, Math.trunc(raw.minNoticeMin))
      : null;
  if (fromDefaults != null) return fromDefaults;
  if (
    typeof input.hoursMinNoticeMin === "number" &&
    Number.isFinite(input.hoursMinNoticeMin)
  ) {
    return Math.max(0, Math.trunc(input.hoursMinNoticeMin));
  }
  return 0;
}

export type ReservationNoticeGate =
  | { ok: true }
  | { ok: false; reason: "too_soon"; error: string };

/**
 * BUF-2 — re-check advance notice on confirm. Slots already hide too-soon
 * starts; a stale client POST must still be refused server-side.
 */
export function assertReservationMeetsNotice(input: {
  startsAt: string;
  minNoticeMin: number;
  now?: Date;
}): ReservationNoticeGate {
  const startMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startMs)) {
    return {
      ok: false,
      reason: "too_soon",
      error: "That time is not available. Pick another start.",
    };
  }
  const noticeMin =
    typeof input.minNoticeMin === "number" && Number.isFinite(input.minNoticeMin)
      ? Math.max(0, Math.trunc(input.minNoticeMin))
      : 0;
  const now = input.now ?? new Date();
  const earliest = now.getTime() + noticeMin * 60_000;
  if (startMs < earliest) {
    return {
      ok: false,
      reason: "too_soon",
      error: "That time is too soon. Pick a later start.",
    };
  }
  return { ok: true };
}
