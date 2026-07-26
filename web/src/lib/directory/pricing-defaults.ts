import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  EMPTY_PRICING_DEFAULTS,
  parsePricingDefaults,
  type TenantPricingDefaults,
} from "@/lib/directory/pricing-defaults-shape";

/**
 * Read a tenant's starting-price defaults out of `agencies.settings`.
 *
 * SERVICE-ROLE ON PURPOSE. `agencies` carries exactly one RLS policy —
 * `is_staff_of_tenant(id)` — so the anon client that renders the PUBLIC
 * directory reads zero rows and every visitor would silently see no default
 * price at all. (Found the hard way: the feature looked completely inert in
 * QA until the policy was checked.) Same shape of problem as the analytics
 * read in demand-score.ts.
 *
 * Safe because the scope is not user input: `tenantId` is already resolved
 * and authorised from the request host, and the read is a single row by
 * primary key returning one non-secret settings namespace.
 *
 * Cached per tenant for a few minutes: the directory reads this on every page
 * load and agencies change their rate card rarely.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: TenantPricingDefaults }>();

export async function loadTenantPricingDefaults(
  tenantId: string | null,
): Promise<TenantPricingDefaults> {
  if (!tenantId) return EMPTY_PRICING_DEFAULTS;

  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const admin = createServiceRoleClient();
  if (!admin) return EMPTY_PRICING_DEFAULTS;

  const { data, error } = await admin
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) return EMPTY_PRICING_DEFAULTS;

  const value = parsePricingDefaults((data as { settings: unknown }).settings);
  cache.set(tenantId, { at: Date.now(), value });
  return value;
}

/** Drop a tenant's cached defaults so an admin save takes effect immediately. */
export function invalidateTenantPricingDefaults(tenantId: string): void {
  cache.delete(tenantId);
}
