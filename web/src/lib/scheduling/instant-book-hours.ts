/* eslint-disable ratchet/no-untenanted-from -- talent_booking_hours is one row per person; a tenant filter would hide hours and fork the calendar. */
/**
 * Does this talent have at least one weekly window? Used to decide whether
 * a timed instant offering may take the no-slot path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseWeeklyHours } from "./hours-types";
import { instantRequiresSlot, weeklyHasBookableWindow } from "./instant-book-gates";

export async function talentHasBookableHours(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("talent_booking_hours")
    .select("weekly")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (!data) return false;
  const weekly = parseWeeklyHours((data as { weekly?: unknown }).weekly);
  return weeklyHasBookableWindow(weekly);
}

/** True when this instant offering must pick a slot and none was sent. */
export async function timedInstantMissingSlot(
  admin: SupabaseClient,
  offering: { kind: string; durationMinutes: number | null },
  talentProfileId: string,
  hasReservation: boolean,
): Promise<boolean> {
  if (hasReservation) return false;
  if (!instantRequiresSlot({ ...offering, hasBookableHours: true })) return false;
  const hoursOn = await talentHasBookableHours(admin, talentProfileId);
  return instantRequiresSlot({ ...offering, hasBookableHours: hoursOn });
}
