import "server-only";

/**
 * TUL-392 — loads the talent's derived Attention signals (site needs publish)
 * for the talent layout.
 *
 * Read-only on purpose; a layout read must not write. Never throws; null means
 * "unknown", so the shell keeps the inbox-only Attention count.
 */

import { goLiveHasPending } from "@/components/talent/site/maison-setup/go-live-pending";
import {
  buildTalentAttentionSignals,
  type TalentAttentionSignal,
} from "@/lib/notifications/attention-signals";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadGoLiveSummary } from "@/lib/talent-site/history/history.server";

export async function loadTalentAttentionSignals(
  talentProfileId: string,
): Promise<TalentAttentionSignal[] | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  try {
    const goLive = await loadGoLiveSummary(admin, talentProfileId, "en");
    return buildTalentAttentionSignals({
      sitePublish:
        goLive && goLiveHasPending(goLive)
          ? { draftRev: goLive.draftRev, firstPublish: goLive.firstPublish != null }
          : null,
    });
  } catch (err) {
    logServerError("talentAttentionSignals.load", err);
    return null;
  }
}
