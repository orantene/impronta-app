import "server-only";

import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function resolveClientConnectionTenant(input: {
  userId: string;
  tenantSlug: string | null | undefined;
}): Promise<{ tenantId: string; tenantSlug: string } | null> {
  const tenantSlug = input.tenantSlug?.trim();
  if (!tenantSlug) return null;
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: clientProfile } = await admin
    .from("client_profiles")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();
  const clientProfileId = (clientProfile as { id?: string } | null)?.id;
  if (!clientProfileId) return null;

  const { data: relationship } = await admin
    .from("agency_client_relationships")
    .select("id")
    .eq("tenant_id", scope.tenantId)
    .eq("client_profile_id", clientProfileId)
    .eq("status", "active")
    .maybeSingle();

  return relationship ? { tenantId: scope.tenantId, tenantSlug } : null;
}
