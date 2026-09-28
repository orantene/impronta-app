import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { loadTalentSiteSwitches } from "./site-switches-server";

/**
 * WSF D, report §8: when a talent is not taking inquiries, NO new guest
 * thread starts, for anyone. A typed email is not identity, so there is no
 * "prove you are an existing client" path here: existing clients continue on
 * their verified thread (guest cookie) or the secure manage link, both of
 * which reply on an existing inquiry and never reach these checks.
 */
export async function talentAcceptsNewThreads(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<boolean> {
  const switches = await loadTalentSiteSwitches(admin, talentProfileId);
  return switches.acceptingInquiries;
}

/**
 * An early draft (created before the switch flipped) becomes a real thread
 * on its first send, so it is gated by the same switch for every seated talent.
 */
export async function draftFirstSendAllowed(
  admin: SupabaseClient,
  inquiryId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("inquiry_participants")
    .select("talent_profile_id")
    .eq("inquiry_id", inquiryId)
    .not("talent_profile_id", "is", null)
    .limit(5);
  if (error) {
    logServerError("talent.intakeGate.draftSeats", error);
    return true;
  }
  for (const row of (data ?? []) as { talent_profile_id: string }[]) {
    if (!(await talentAcceptsNewThreads(admin, row.talent_profile_id))) return false;
  }
  return true;
}
