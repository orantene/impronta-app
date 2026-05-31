import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Tenant Registration Engine notifications (S5). Fire-and-forget; the dispatcher
 * no-ops without RESEND_API_KEY and stable eventIds dedupe retries.
 *
 *  - roster.join_requested → workspace Manager+ (a talent asked to join; pending).
 *  - roster.join_approved  → the talent (their pending request was approved).
 *  - roster.join_rejected  → the talent (their request was declined).
 */

async function loadWorkspace(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ slug: string | null; displayName: string | null }> {
  const { data } = await admin
    .from("agencies")
    .select("slug, display_name")
    .eq("id", tenantId)
    .maybeSingle();
  const row = data as { slug?: string | null; display_name?: string | null } | null;
  return { slug: row?.slug ?? null, displayName: row?.display_name ?? null };
}

async function loadTalent(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<{ userId: string | null; displayName: string | null }> {
  const { data } = await admin
    .from("talent_profiles")
    .select("user_id, display_name")
    .eq("id", talentProfileId)
    .maybeSingle();
  const row = data as { user_id?: string | null; display_name?: string | null } | null;
  return { userId: row?.user_id ?? null, displayName: row?.display_name ?? null };
}

/** Notify workspace Manager+ that a talent requested to join (pending). */
export async function notifyRosterJoinRequested(params: {
  admin: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
}): Promise<void> {
  const { admin, tenantId, talentProfileId } = params;
  try {
    const [{ slug }, talent] = await Promise.all([
      loadWorkspace(admin, tenantId),
      loadTalent(admin, talentProfileId),
    ]);
    const reviewUrl = slug
      ? `${getAppUrl()}/${encodeURIComponent(slug)}/admin/roster/registration`
      : `${getAppUrl()}`;
    void dispatchEventNotifications({
      type: "roster.join_requested",
      tenantId,
      eventId: `roster-join-req:${tenantId}:${talentProfileId}`,
      payload: { talentName: talent.displayName, reviewUrl },
    }).catch((err) => logServerError("notifyRosterJoinRequested.dispatch", err));
  } catch (err) {
    logServerError("notifyRosterJoinRequested", err);
  }
}

/** Notify the talent their join request was approved. */
export async function notifyRosterJoinApproved(params: {
  admin: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
}): Promise<void> {
  const { admin, tenantId, talentProfileId } = params;
  try {
    const [workspace, talent] = await Promise.all([
      loadWorkspace(admin, tenantId),
      loadTalent(admin, talentProfileId),
    ]);
    if (!talent.userId) return; // unclaimed — nobody to notify
    void dispatchEventNotifications({
      type: "roster.join_approved",
      tenantId,
      userId: talent.userId,
      eventId: `roster-join-approved:${tenantId}:${talentProfileId}`,
      payload: {
        talentName: talent.displayName,
        workspaceName: workspace.displayName,
        dashboardUrl: `${getAppUrl()}/talent`,
      },
    }).catch((err) => logServerError("notifyRosterJoinApproved.dispatch", err));
  } catch (err) {
    logServerError("notifyRosterJoinApproved", err);
  }
}

/** Notify the talent their join request was declined. */
export async function notifyRosterJoinRejected(params: {
  admin: SupabaseClient;
  tenantId: string;
  talentProfileId: string;
}): Promise<void> {
  const { admin, tenantId, talentProfileId } = params;
  try {
    const [workspace, talent] = await Promise.all([
      loadWorkspace(admin, tenantId),
      loadTalent(admin, talentProfileId),
    ]);
    if (!talent.userId) return;
    void dispatchEventNotifications({
      type: "roster.join_rejected",
      tenantId,
      userId: talent.userId,
      eventId: `roster-join-rejected:${tenantId}:${talentProfileId}`,
      payload: {
        talentName: talent.displayName,
        workspaceName: workspace.displayName,
        exploreUrl: `${getAppUrl()}/talent/discover-agencies`,
      },
    }).catch((err) => logServerError("notifyRosterJoinRejected.dispatch", err));
  } catch (err) {
    logServerError("notifyRosterJoinRejected", err);
  }
}
