import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { askEntryPointsVisible, resolveTalentAskEntry } from "@/lib/talent/chat-entry";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";

/**
 * Whether a talent's public ask / inquire entry points may render (WSF rule:
 * every ask entry goes through askEntryPointsVisible). A failed or missing
 * read keeps them visible, matching the switches' fail-open contract.
 */
export async function loadTalentAskVisible(talentProfileId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const switches = admin ? await loadTalentSiteSwitches(admin, talentProfileId) : null;
  return switches ? askEntryPointsVisible(resolveTalentAskEntry(switches)) : true;
}
