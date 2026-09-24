import type { SupabaseClient } from "@supabase/supabase-js";

import { parseBookingHours } from "./hours-types";
import { loadBusyIntervals } from "./load-busy";
import { computePublicSlots } from "./public-slots";

/** The first open starts, or an empty list. Never invents a time. */
export function pickNextFreeStarts(starts: readonly string[], limit = 3): string[] {
  return starts.filter((s) => s.length > 0).slice(0, limit);
}

/**
 * Next open times on the same busy calendar the hold uses.
 * Any read failure returns an empty list so the panel can say "pick another time".
 */
export async function nextFreeTimesForTalent(
  admin: SupabaseClient,
  talentProfileId: string,
  now: Date = new Date(),
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
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const busy = await loadBusyIntervals({ admin, talentProfileId, from: now, to, now });
    const { starts } = computePublicSlots({
      hours,
      durationMinutes: hours.slotMinutes ?? 60,
      from: now,
      days: 7,
      busy,
    });
    return pickNextFreeStarts(starts);
  } catch {
    return [];
  }
}
