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
