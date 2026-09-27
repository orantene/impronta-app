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
