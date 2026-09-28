import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTalentAskEntry, type TalentAskEntry } from "@/lib/talent/chat-entry";
import { parseTalentSiteSwitches, type TalentSiteSwitches } from "@/lib/talent/site-switches";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";

import { getActiveGuestInquiry } from "../_actions/guest-chat-actions";

/**
 * WSF D: the talent's own chat switch covers her /t/ profile too (auditor
 * ruling). Agency-level guest chat settings still gate agency surfaces; the
 * talent's switch narrows on top. §8 "Existing clients": a visitor with a
 * live thread keeps the dock.
 */
export async function loadTalentIntake(input: {
  admin: SupabaseClient | null;
  talentProfileId: string;
  chatTenantSlug: string | null;
}): Promise<{ switches: TalentSiteSwitches; askEntry: TalentAskEntry }> {
  const switches = input.admin
    ? await loadTalentSiteSwitches(input.admin, input.talentProfileId)
    : parseTalentSiteSwitches(null);
  const resume =
    input.chatTenantSlug && !(switches.chatEnabled && switches.acceptingInquiries)
      ? await getActiveGuestInquiry({ tenantSlug: input.chatTenantSlug, talentProfileId: input.talentProfileId })
      : null;
  const askEntry = resolveTalentAskEntry(switches, {
    hasActiveThread: Boolean(resume?.ok && resume.active),
  });
  return { switches, askEntry };
}
