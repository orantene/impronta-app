/**
 * Per-tenant switch for the STANDING review surfaces.
 *
 * `agency_entitlements.reviews_enabled` gates the review surfaces per tenant
 * (public profile reviews + testimonials, directory card standing, the talent
 * Reviews page, and the client Reviews area). Gated on the SURFACE tenant so a
 * hub controls its own surfaces independently.
 *
 * NOT A PREMIUM GATE ANY MORE. The platform default is ON (migration
 * `20261201000000_reviews_enabled_default_on.sql` flipped the column default and
 * backfilled every row): collecting reviews is free on every tier, because
 * reviews are marketplace trust data and every review any talent collects makes
 * the whole platform more bookable. The column remains a real switch platform
 * staff can turn OFF for a specific tenant.
 *
 * Consequence for this resolver: it DEFAULTS ON rather than failing closed. A
 * tenant with no `agency_entitlements` row has never had a platform decision
 * made about it, so it gets the platform default (true) — the old
 * missing-row-means-false behavior is exactly how reviews ended up dark for
 * tenants nobody had provisioned. Only an explicit stored `false` turns the
 * surfaces off. Reviews are public trust data, not a security boundary, so an
 * unresolvable read degrades to the default too rather than silently hiding a
 * talent's standing.
 *
 * Plain server module (not "use server") so server components can import it.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Platform default when no explicit per-tenant decision is stored. */
export const REVIEWS_ENABLED_PLATFORM_DEFAULT = true;

export async function tenantReviewsEnabled(
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (!tenantId) return REVIEWS_ENABLED_PLATFORM_DEFAULT;
  const svc = createServiceRoleClient();
  if (!svc) return REVIEWS_ENABLED_PLATFORM_DEFAULT;
  try {
    const { data, error } = await svc
      .from("agency_entitlements")
      .select("reviews_enabled")
      .eq("tenant_id", tenantId)
      .returns<{ reviews_enabled: boolean | null }[]>()
      .maybeSingle();
    if (error) return REVIEWS_ENABLED_PLATFORM_DEFAULT;
    // No row → no platform decision → default. Explicit `false` → off.
    if (!data || data.reviews_enabled == null) {
      return REVIEWS_ENABLED_PLATFORM_DEFAULT;
    }
    return data.reviews_enabled === true;
  } catch {
    return REVIEWS_ENABLED_PLATFORM_DEFAULT;
  }
}
