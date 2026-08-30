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
