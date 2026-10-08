import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Makes sure this client has an `agency_client_relationships` row for the
 * talent's tenant. Same upsert (and conflict target) the onboarding portal uses
 * in `app/onboarding/actions.ts`; that helper is private to a "use server"
 * file and cannot be imported, so this is the shared copy for the account flow.
 * Returns false (and logs) when the client has no `client_profiles` row yet.
 */
export async function ensureTenantClientRelationship(input: {
  userId: string;
  tenantId: string;
  originDomain: string | null;
}): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data: profile, error } = await admin
    .from("client_profiles")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error || !profile?.id) {
    if (error) logServerError("clientAccount.relationship.profile", error);
    return false;
  }
  const now = new Date().toISOString();
  const { error: upsertErr } = await admin.from("agency_client_relationships").upsert(
    {
      tenant_id: input.tenantId,
      client_profile_id: profile.id,
      source_type: "direct",
      status: "active",
      added_by: input.userId,
      last_interaction_at: now,
      source_workspace_id: input.tenantId,
      origin_domain: input.originDomain,
    },
    { onConflict: "tenant_id,client_profile_id", ignoreDuplicates: true },
  );
  if (upsertErr) {
    logServerError("clientAccount.relationship.upsert", upsertErr);
    return false;
  }
  return true;
}
