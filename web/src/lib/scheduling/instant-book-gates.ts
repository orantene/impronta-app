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
import { parseSellingBookingSettings } from "@/lib/talent/selling-booking-settings";

/**
 * Master "is this person taking new bookings at all" switch.
 *
 * TODO(Phase 1): read `accepting_bookings` once that column exists. It is not
 * in the schema yet, so this always answers ok; it is the single hook the
 * column will plug into, evaluated BEFORE the per-offering mode.
 */
export function assertAcceptingNewBookings(accepting?: boolean | null): { ok: true } | { ok: false } {
  return accepting === false ? { ok: false } : { ok: true };
}

export type EffectiveBookingMode = {
  mode: "instant" | "request" | "inquiry" | "closed";
  /** Where the mode came from. */
  source: "master" | "offering" | "default";
};

/**
 * F4 — the effective booking mode of one offering.
 *
 * Precedence: master restriction → offering's own explicit mode → talent
 * default posture (`selling_defaults.bookingPosture`).
 *
 * EXPLICIT VS INHERITED, as the schema allows today:
 * `talent_offerings.booking_mode` is `NOT NULL DEFAULT 'request'`, so there is
 * no stored "inherit" state. `instant` can only exist because someone chose it,
 * so it is treated as an explicit override and beats an inquiry posture (a
 * photographer who defaults to inquiries can keep an instantly bookable
 * consultation). `request` is ambiguous (chosen, or the column default); it
 * resolves to request, the mode the row states and the public CTA already
 * uses. Distinguishing an inherited `request` needs a nullable column or an
 * explicit-override marker: a schema change, not made here.
 */
export function resolveEffectiveBookingMode(input: {
  offering: { bookingMode: string | null | undefined };
  defaults: unknown;
  accepting?: boolean | null;
}): EffectiveBookingMode {
  if (!assertAcceptingNewBookings(input.accepting).ok) return { mode: "closed", source: "master" };
  if (input.offering.bookingMode === "instant") return { mode: "instant", source: "offering" };
  const posture = parseSellingBookingSettings(input.defaults).bookingPosture;
  if (posture === "inquiry") return { mode: "inquiry", source: "default" };
  return { mode: "request", source: "offering" };
}

export type InstantPostureGate =
  | { ok: true }
  | { ok: false; reason: "inquiry_only" | "request_only"; error: string };

/**
 * Server refusal of an instant booking whose EFFECTIVE mode is not instant,
 * whatever the page sent. The till (`staffDesk`) is exempt: staff are the
 * confirmation for a walk-in.
 */
export function assertInstantPosture(input: {
  sellingDefaults: unknown;
  bookingMode: string | null | undefined;
  staffDesk: boolean;
  accepting?: boolean | null;
}): InstantPostureGate {
  if (input.staffDesk) return { ok: true };
  const effective = resolveEffectiveBookingMode({
    offering: { bookingMode: input.bookingMode },
    defaults: input.sellingDefaults,
    accepting: input.accepting,
  });
  if (effective.mode === "instant") return { ok: true };
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
