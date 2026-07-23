import "server-only";

import { unstable_cache } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tagFor } from "@/lib/site-admin";
import { logServerError } from "@/lib/server/safe-error";
import { planTierHasWhitelabel } from "@/lib/saas/workspace-public-url";

/**
 * Whitelabel branding resolution for the OPERATIONAL surfaces a tenant's talents
 * and clients see (auth chrome, "Powered by Tulala" footer, agency emails).
 *
 * Authenticated dashboard surfaces already carry `plan_tier` through the shell
 * identity payload (`loadTenantIdentity` → `bridgeTenantIdentity.planTier`) and
 * should gate on {@link planTierHasWhitelabel} directly. This module exists for
 * the PUBLIC / unauthenticated contexts where `agencies.plan_tier` is not in any
 * RLS-public projection — it reads through the service-role client (same as
 * `loadTenantIdentity`) behind a cache barrier so the auth page and storefront
 * footer don't pay a DB hit on every render.
 *
 * Fails closed: any error, missing env, or missing tenant resolves to `false`
 * (Tulala branding), so a read failure never leaks an agency brand it shouldn't.
 */
export function loadTenantWhitelabel(tenantId: string): Promise<boolean> {
  if (!tenantId) return Promise.resolve(false);

  return unstable_cache(
    async (): Promise<boolean> => {
      const admin = createServiceRoleClient();
      if (!admin) return false;
      const { data, error } = await admin
        .from("agencies")
        .select("plan_tier")
        .eq("id", tenantId)
        .maybeSingle<{ plan_tier: string | null }>();
      if (error) {
        logServerError("tenant-whitelabel.loadTenantWhitelabel", error);
        return false;
      }
      return planTierHasWhitelabel(data?.plan_tier ?? null);
    },
    ["brand:whitelabel:v1", tenantId],
    {
      // Tagged on the tenant's identity so a branding/identity edit refreshes it
      // promptly; the 300s TTL is the cross-runtime safety net for a plan-tier
      // change made by a platform admin (which does not bust the identity tag).
      tags: [tagFor(tenantId, "identity")],
      revalidate: 300,
    },
  )();
}
