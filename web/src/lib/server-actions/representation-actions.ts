"use server";

import { loadRepresentation } from "@/lib/talent/load-representation";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Agency admin: load a talent's full representation for the mirror drawer.
 */
export async function loadRepresentationForAgencyAdmin(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; data: Awaited<ReturnType<typeof loadRepresentation>> }
  | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error" };

  const { data: roster, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", auth.tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .neq("status", "removed")
    .maybeSingle();

  if (rosterErr || !roster) {
    logServerError("representation.admin.roster-check", rosterErr);
    return { ok: false, error: "Talent is not on your roster." };
  }

  const { data: profile, error: profileErr } = await admin
    .from("talent_profiles")
    .select("profile_code")
    .eq("id", input.talent_profile_id)
    .maybeSingle();

  if (profileErr || !profile) {
    logServerError("representation.admin.profile", profileErr);
    return { ok: false, error: "Profile not found." };
  }

  const data = await loadRepresentation(
    input.talent_profile_id,
    profile.profile_code,
  );
  return { ok: true, data };
}
