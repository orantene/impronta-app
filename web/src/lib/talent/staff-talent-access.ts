import "server-only";

import { talentOnWorkspaceRoster } from "@/lib/scheduling/hours-roster-guard";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Staff may edit a talent's profile-level data (services menu, booking terms) only as an active
 * member holding `agency.roster.edit` in a workspace whose roster (or created resources) includes
 * the talent. A global staff `app_role` is not enough: these writers use the service role, so
 * without the roster check any staff user of ANY workspace could rewrite ANY talent.
 */
export async function staffMayEditTalent(talentProfileId: string): Promise<boolean> {
  const staff = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
  if (!staff.ok) return false;
  const admin = createServiceRoleClient();
  if (!admin) return false;
  return talentOnWorkspaceRoster(admin, staff.tenantId, talentProfileId);
}
