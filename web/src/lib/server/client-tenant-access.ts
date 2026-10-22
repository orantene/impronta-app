import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * TUL-1733: is this client (by auth user id) a client of THIS workspace? `client_profiles` has no
 * tenant column and its write policy admits any global `agency_staff`, so a workspace action that
 * edits a client must prove the relationship row first (same check as the client snapshot route).
 * Fails closed: an unreadable answer is "no".
 */
export async function clientBelongsToTenant(
  supabase: SupabaseClient,
  tenantId: string,
  clientUserId: string,
): Promise<boolean> {
  if (!tenantId || !clientUserId) return false;
  const { data: profile, error } = await supabase
    .from("client_profiles")
    .select("id")
    .eq("user_id", clientUserId)
    .maybeSingle();
  if (error) {
    logServerError("clientTenantAccess.profile", error);
    return false;
  }
  const clientProfileId = (profile as { id?: string } | null)?.id;
  if (!clientProfileId) return false;
  const { data: rel, error: relErr } = await tenantScopedQuery(supabase, "agency_client_relationships", tenantId)
    .select("id")
    .eq("client_profile_id", clientProfileId)
    .maybeSingle();
  if (relErr) {
    logServerError("clientTenantAccess.relationship", relErr);
    return false;
  }
  return !!(rel as { id?: string } | null)?.id;
}
