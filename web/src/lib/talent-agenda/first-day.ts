/**
 * First-day readiness steps for Agenda V2 Today.
 * One source: dashboard completion missing keys + booking hours + publish state.
 */

import type { BookingHours } from "@/lib/scheduling/hours-types";

export const FIRST_DAY_STEPS = [
  "photo",
  "services",
  "location",
  "availability",
  "preview",
  "website",
] as const;

export type FirstDayStepId = (typeof FIRST_DAY_STEPS)[number];

export type FirstDayInput = {
  missingKeys?: string[] | null;
  /** When completion bridge is absent, fall back to these profile signals. */
  portfolioCount?: number;
  primaryTypeLabel?: string | null;
  homeCity?: string | null;
  profileCode?: string | null;
  workflowStatus?: string | null;
  hours?: BookingHours | null;
};

/** True when weekly hours include at least one open window. */
export function hasBookingHoursWindows(hours: BookingHours | null | undefined): boolean {
  if (!hours?.weekly) return false;
  return Object.values(hours.weekly).some((windows) =>
    (windows ?? []).some((w) => w.endMin > w.startMin),
  );
}

function missingHas(missing: Set<string> | null, key: string): boolean {
  return missing?.has(key) ?? false;
}

/**
 * Completed step ids for the first-day ring. Prefer bridge missing keys;
 * fall back to profile fields when completion is null (fixtures / flag edge).
 */
export function firstDayCompletedStepIds(input: FirstDayInput): FirstDayStepId[] {
  const missing =
    input.missingKeys != null ? new Set(input.missingKeys) : null;
  const done: FirstDayStepId[] = [];

  const photoOk =
    missing != null
      ? !missingHas(missing, "media")
      : (input.portfolioCount ?? 0) > 0;
  if (photoOk) done.push("photo");

  const servicesOk =
    missing != null
      ? !missingHas(missing, "taxonomy")
      : Boolean(input.primaryTypeLabel);
  if (servicesOk) done.push("services");

  const locationOk =
    missing != null
      ? !missingHas(missing, "location")
      : Boolean(input.homeCity);
  if (locationOk) done.push("location");

  if (hasBookingHoursWindows(input.hours)) done.push("availability");

  if (input.profileCode) done.push("preview");

  if (input.workflowStatus === "published") done.push("website");

  return done;
}

export function isFirstDayEligible(input: {
  loadError?: string | null;
  agendaItemCount: number;
  completedStepIds: readonly string[];
}): boolean {
  if (input.loadError) return false;
  // Empty agenda + incomplete readiness — do not show first-day over a live week.
  return (
    input.agendaItemCount === 0 &&
    input.completedStepIds.length < FIRST_DAY_STEPS.length
  );
}
