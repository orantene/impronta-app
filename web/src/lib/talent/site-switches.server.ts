import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseTalentSiteSwitches, type TalentSiteSwitches } from "./site-switches";

/**
 * One small read of a talent's `talent_sites` switches. A missing row or any
 * read error is all-on (absence never pauses a talent), so a DB blip cannot
 * silently turn a talent's chat or inquiries off.
 */
export async function loadTalentSiteSwitches(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<TalentSiteSwitches> {
  const { data, error } = await admin
    .from("talent_sites")
    .select("accepting_bookings, accepting_inquiries, chat_enabled, chat_config")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) return parseTalentSiteSwitches(null);
  return parseTalentSiteSwitches(data as Record<string, unknown> | null);
}
