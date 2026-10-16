/**
 * TUL-861: pure half of the profile availability badge check (no server-only, no I/O), so a
 * test can import it. See profile-live-availability.ts for why the badge asks the live loader.
 */
import type { PublicOpenTimesResult } from "@/lib/scheduling/public-open-times";

export type ProfileAvailability = {
  nextAvailableDate: string | null;
  availableDaysInNext30: number | null;
  availabilityDots14d: string | null;
};

/** Should the badge be hidden, given the live answer for each public bookable service? Unknown or failed answers never hide it. */
export function liveSlotsAllEmpty(results: ReadonlyArray<PublicOpenTimesResult>): boolean {
  if (results.length === 0) return false;
  return results.every((r) => r.ok && r.slots.length === 0);
}
