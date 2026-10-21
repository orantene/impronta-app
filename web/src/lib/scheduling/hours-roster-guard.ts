import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Staff may touch a talent's booking hours / direct-booking opt-in only when that talent is on
 * THEIR workspace's roster (active or pending, the same rows the hours picker lists). Without
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
  return Array.isArray(data) && data.length > 0;
}
