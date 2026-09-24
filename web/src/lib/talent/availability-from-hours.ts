import type { BookingHours, WeeklyHours } from "@/lib/scheduling/hours-types";

export function weeklyHasWindow(weekly: WeeklyHours | null | undefined): boolean {
  if (!weekly) return false;
  return [0, 1, 2, 3, 4, 5, 6].some((day) => (weekly[day as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? []).length > 0);
}

export function availabilityFromHours(input: {
  hours: BookingHours | null;
  byAgreement?: boolean;
}): boolean {
  if (input.byAgreement) return true;
  return weeklyHasWindow(input.hours?.weekly ?? null);
}
