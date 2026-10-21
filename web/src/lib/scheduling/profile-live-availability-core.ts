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

function ymdInZone(iso: string, timeZone: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * The days (YYYY-MM-DD, in each service's own hours zone) that have at least one live time,
 * across every checked service. `null` when no answer was usable, so the caller keeps the matview.
 * The sheet's window is capped by the hours' horizon (often ~2 weeks), so this is the true count,
 * not the matview's "30 of 30".
 */
export function liveOpenDays(results: ReadonlyArray<PublicOpenTimesResult>): string[] | null {
  const days = new Set<string>();
  let usable = false;
  for (const r of results) {
    if (!r.ok) continue;
    usable = true;
    for (const iso of r.slots) {
      const ymd = ymdInZone(iso, r.timezone ?? "UTC");
      if (ymd) days.add(ymd);
    }
  }
  return usable ? [...days].sort() : null;
}

/** The badge, restated from the same live times the sheet shows (same window, same count). */
export function badgeFromLiveDays(base: ProfileAvailability, days: readonly string[], now: Date): ProfileAvailability {
  if (days.length === 0) return { nextAvailableDate: null, availableDaysInNext30: null, availabilityDots14d: null };
  const open = new Set(days);
  let dots = "";
  for (let i = 0; i < 14; i += 1) {
    const ymd = new Date(now.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    dots += open.has(ymd) ? "\u00b7" : "\u00d7";
  }
  return {
    nextAvailableDate: days[0] ?? base.nextAvailableDate,
    availableDaysInNext30: days.length,
    availabilityDots14d: dots,
  };
}
