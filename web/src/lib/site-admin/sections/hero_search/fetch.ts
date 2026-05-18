import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { listTalentIdsOnTenantRoster } from "@/lib/saas/talent-roster";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Tenant-scoped talent count for the optional dynamic stat line.
 *
 * Tenant isolation: `listTalentIdsOnTenantRoster(tenantId)` resolves only
 * this tenant's active site-visible roster (explicit `tenant_id` filter in
 * the helper, not RLS-only). Returns the count of that set. Zero-safe.
 */
export async function fetchTenantTalentCount(
  tenantId: string,
): Promise<number> {
  const supabase = createPublicSupabaseClient();
  if (!supabase || !tenantId) return 0;
  try {
    const roster = await listTalentIdsOnTenantRoster(supabase, tenantId);
    return roster.length;
  } catch (error) {
    logServerError("hero_search/fetchTenantTalentCount", error);
    return 0;
  }
}
