import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Emit `talent.profile_approved` (spec §6.3) when a workspace admin makes a
 * roster talent site-visible (roster_only → site_visible). The catalog entry
 * renders the branded "your profile is approved" email + a talent-surface bell.
 *
 * Shared by both producers — the single-talent eye toggle
 * (`setRosterTalentSiteVisibility`) and the bulk publish
 * (`bulkSetWorkflowStatus`) — so the lookup of the talent's account + canonical
 * public URL lives in one place.
 *
 * Fire-and-forget: the dispatcher no-ops without RESEND_API_KEY, and the stable
 * `eventId` (`talent-approved:<tenant>:<talent>`) dedupes repeat toggles so a
 * talent isn't re-emailed every time an admin flips the eye. Skips silently
 * when the talent has no claimed account (no recipient to notify — the
 * claim-invite flow covers unclaimed talent).
 */
export async function notifyTalentProfileApproved(params: {
  admin: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
}): Promise<void> {
  const { admin, tenantId, talentProfileId } = params;
  try {
    const { data, error } = await admin
      .from("talent_profiles")
      .select("user_id, display_name, profile_code")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (error) {
      logServerError("notifyTalentProfileApproved.lookup", error);
      return;
    }
    const talent = data as {
      user_id: string | null;
      display_name: string | null;
      profile_code: string | null;
    } | null;
    if (!talent?.user_id) return; // unclaimed talent — nobody to notify

    const profileUrl = talent.profile_code
      ? `${getAppUrl()}/t/${encodeURIComponent(talent.profile_code)}`
      : `${getAppUrl()}/talent`;

    void dispatchEventNotifications({
      type: "talent.profile_approved",
      tenantId,
      userId: talent.user_id,
      eventId: `talent-approved:${tenantId}:${talentProfileId}`,
      payload: {
        talentName: talent.display_name,
        profileUrl,
      },
    }).catch((err) => {
      logServerError("notifyTalentProfileApproved.dispatch", err);
    });
  } catch (err) {
    logServerError("notifyTalentProfileApproved", err);
  }
}
