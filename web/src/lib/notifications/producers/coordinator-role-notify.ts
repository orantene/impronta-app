import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import { afterResponse } from "@/lib/server/after-response";

/**
 * TUL-1470: tell one person their own role on a multi-person job. Fire-and-forget and
 * idempotent (eventId = job + role + person), never throws. The payload carries ONLY that
 * person's part: role, event title, call time, time zone. Nobody else's role, no client, no money.
 */
export async function notifyCoordinatorRoleAssigned(params: {
  admin: SupabaseClient;
  tenantId: string;
  jobId: string;
  roleId: string;
  role: string;
  eventTitle: string;
  startsAt: string | null;
  timeZone: string;
  talentProfileId: string;
}): Promise<boolean> {
  const { admin, tenantId, jobId, roleId, role, eventTitle, startsAt, timeZone, talentProfileId } = params;
  try {
    const { data, error } = await admin.from("talent_profiles").select("user_id").eq("id", talentProfileId).maybeSingle();
    if (error) {
      logServerError("notifyCoordinatorRoleAssigned.talent", error);
      return false;
    }
    const userId = (data as { user_id?: string | null } | null)?.user_id ?? null;
    if (!userId) return false; // unclaimed profile: nobody to tell
    afterResponse(() =>
      dispatchEventNotifications({
        type: "coordinator.role_assigned",
        tenantId,
        userId,
        eventId: `coordinator-role:${jobId}:${roleId}:${talentProfileId}`,
        payload: { role, eventTitle, startsAt, timeZone },
      }).catch((err) => logServerError("notifyCoordinatorRoleAssigned.dispatch", err)),
    );
    return true;
  } catch (err) {
    logServerError("notifyCoordinatorRoleAssigned", err);
    return false;
  }
}
