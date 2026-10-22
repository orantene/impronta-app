import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Staff may touch a talent's booking hours / direct-booking opt-in only when that talent is on
 * THEIR workspace's roster (active or pending, the same rows the hours picker lists), or is a
 * resource profile the workspace created (resources are not roster rows). Without
 * this, staff of workspace A could rewrite hours or booking terms of a talent in workspace B,
 * because the hours writers use the service role. A failed lookup is a refusal.
 */
export async function talentOnWorkspaceRoster(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
  talentProfileId: string,
): Promise<boolean> {
  if (!tenantId || !talentProfileId) return false;
  const { data, error } = await tenantScopedQuery(admin as SupabaseClient, "agency_talent_roster", tenantId)
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["active", "pending"])
    .limit(1);
  if (error) {
    logServerError("booking-hours.rosterGuard", error);
    return false;
  }
  if (Array.isArray(data) && data.length > 0) return true;
  // Resource profiles (rooms, chairs, equipment) are created by the workspace and never join the roster.
  // eslint-disable-next-line ratchet/no-untenanted-from -- talent_profiles is a global identity table; the created_by_agency_id filter is the tenant scope
  const resource = await admin
    .from("talent_profiles")
    .select("id")
    .eq("id", talentProfileId)
    .eq("created_by_agency_id", tenantId)
    .eq("profile_kind", "resource")
    .is("deleted_at", null)
    .limit(1);
  if (resource.error) {
    logServerError("booking-hours.rosterGuard.resource", resource.error);
    return false;
  }
  return Array.isArray(resource.data) && resource.data.length > 0;
}
