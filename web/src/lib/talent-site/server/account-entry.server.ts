import "server-only";

import { resolveClientAccountMount } from "@/lib/client-account/gate";
import { clientAccountEntitled, resolveClientAccountEntry } from "@/lib/client-account/entry-visibility";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";

/**
 * TUL-694: does this talent site show the client account entry? Flag off returns false
 * without reading. A read failure fails open to the defaults (auto, taking bookings).
 */
export async function resolveTalentAccountEntry(talentProfileId: string, planKey: string | null | undefined): Promise<boolean> {
  const flagOn = resolveClientAccountMount("talent").headerItem;
  if (!flagOn) return false;
  const admin = createServiceRoleClient();
  const sw = admin ? await loadTalentSiteSwitches(admin, talentProfileId) : null;
  return resolveClientAccountEntry({
    flagOn,
    setting: sw?.chatConfig.clientAccountEntry ?? "auto",
    acceptingBookings: sw?.acceptingBookings ?? true,
    entitled: clientAccountEntitled(planKey),
  });
}
