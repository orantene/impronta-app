import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireTalentSelfAction, requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Auth shared by every talent media read loader (the paged / full bundles and
 * the profile shell overview): roster staff of the talent's workspace OR the
 * owning talent. Lives here, not in a "use server" file, so the service-role
 * client it returns is never exposed as a callable server action.
 */
export async function authorizeTalentMediaRead(
  talentProfileId: string,
): Promise<{ ok: true; admin: SupabaseClient } | { ok: false; error: string }> {
  const staff = await requireWorkspaceStaffAction();
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  if (staff.ok) {
    const { data: rosterRow, error: rosterErr } = await admin.from("agency_talent_roster").select("id")
      .eq("tenant_id", staff.tenantId).eq("talent_profile_id", talentProfileId).neq("status", "removed").maybeSingle();
    if (rosterErr) logServerError("media.readAuth.roster", rosterErr);
    if (!rosterRow) return { ok: false, error: "Talent not on this roster." };
  } else if (!(await requireTalentSelfAction(talentProfileId)).ok) {
    return { ok: false, error: staff.error };
  }
  return { ok: true, admin };
}
