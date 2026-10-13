/**
 * TUL-634: the dashboard nudge when onboarding could not save booking hours
 * (no time zone known). The first-day "availability" step is complete only
 * when an hours row with an open window exists, so an unfinished step is the
 * signal. Pure.
 */

export const HOURS_NUDGE_COPY = {
  en: "Set your time zone to take bookings",
  es: "Configura tu zona horaria para recibir reservas",
} as const;

export function showHoursSetupNudge(completedStepIds: readonly string[]): boolean {
  return !completedStepIds.includes("availability");
}
