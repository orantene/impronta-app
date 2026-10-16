/**
 * TUL-634: the dashboard nudge when onboarding could not save booking hours
 * (no time zone known). The first-day "availability" step is complete only
 * when an hours row with an open window exists, so an unfinished step is the
 * signal. Pure.
 */

import type { BookingHours } from "./hours-types";
import { hasBookingHoursWindows } from "@/lib/talent-agenda/first-day";

export const HOURS_NUDGE_COPY = {
  en: "Set your time zone to take bookings",
  es: "Configura tu zona horaria para recibir reservas",
} as const;

export function showHoursSetupNudge(completedStepIds: readonly string[]): boolean {
  return !completedStepIds.includes("availability");
}

/**
 * The Today nudge is independent of the first-day card (which an established
 * talent never sees): show it whenever the talent has no usable open window.
 * A failed agenda load is "unknown", not "empty", so it stays hidden.
 */
export function needsHoursSetupNudge(
  hours: BookingHours | null | undefined,
  loadError?: string | null,
): boolean {
  if (loadError) return false;
  return !hasBookingHoursWindows(hours);
}
