import type { SupabaseClient } from "@supabase/supabase-js";

import { parseBookingHours } from "./hours-types";
import { loadBusyIntervals } from "./load-busy";
import { computePublicSlots } from "./public-slots";

/** The first open starts, or an empty list. Never invents a time. */
export function pickNextFreeStarts(starts: readonly string[], limit = 3): string[] {
  return starts.filter((s) => s.length > 0).slice(0, limit);
}

function dayKey(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * The free starts nearest a requested time: the same local day first (closest
 * to the requested instant), then the following days in order, then anything
 * earlier. Result is chronological. Never invents a time.
 */
export function pickNearestStarts(
  starts: readonly string[],
  aroundIso: string,
  timeZone = "UTC",
  limit = 3,
): string[] {
  const target = Date.parse(aroundIso);
  const valid = starts.filter((s) => s.length > 0 && Number.isFinite(Date.parse(s)));
  if (!Number.isFinite(target)) return pickNextFreeStarts(valid, limit);
  const day = dayKey(aroundIso, timeZone);
  const same = valid
    .filter((s) => dayKey(s, timeZone) === day)
    .sort((a, b) => Math.abs(Date.parse(a) - target) - Math.abs(Date.parse(b) - target));
  const after = valid.filter((s) => dayKey(s, timeZone) > day).sort((a, b) => Date.parse(a) - Date.parse(b));
  const before = valid
    .filter((s) => dayKey(s, timeZone) < day)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return [...same, ...after, ...before].slice(0, limit).sort((a, b) => Date.parse(a) - Date.parse(b));
}

/**
 * Next open times on the same busy calendar the hold uses.
 * Any read failure returns an empty list so the panel can say "pick another time".
 */
export async function nextFreeTimesForTalent(
  admin: SupabaseClient,
  talentProfileId: string,
  now: Date = new Date(),
  /** Prefer the free times nearest this requested start (same day first). */
  near?: { startsAt: string; timeZone?: string },
): Promise<string[]> {
  try {
    const { data, error } = await admin
      .from("talent_booking_hours")
      .select("timezone, weekly, exceptions, horizon_days, slot_minutes")
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    if (error || !data) return [];
    const hours = parseBookingHours(data);
    if (!hours) return [];
    const requested = near ? Date.parse(near.startsAt) : NaN;
    // Reach past the requested day so "following days" exist; capped.
    const spanDays = Number.isFinite(requested)
      ? Math.min(60, Math.max(7, Math.ceil((requested - now.getTime()) / 86_400_000) + 4))
      : 7;
    const to = new Date(now.getTime() + spanDays * 24 * 60 * 60 * 1000);
    const busy = await loadBusyIntervals({ admin, talentProfileId, from: now, to, now });
    const { starts } = computePublicSlots({
      hours,
      durationMinutes: hours.slotMinutes ?? 60,
      from: now,
      days: spanDays,
      busy,
    });
    return near && Number.isFinite(requested)
      ? pickNearestStarts(starts, near.startsAt, near.timeZone ?? hours.timezone ?? "UTC")
      : pickNextFreeStarts(starts);
  } catch {
    return [];
  }
}
