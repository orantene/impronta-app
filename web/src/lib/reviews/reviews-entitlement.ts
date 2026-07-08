/**
 * Premium gate for the STANDING review capability.
 *
 * Reviews are a premium feature. `agency_entitlements.reviews_enabled` gates the
 * review surfaces per tenant (public profile reviews + testimonials, directory
 * card standing, the talent Reviews page, and the client Reviews area). Gated on
 * the SURFACE tenant so a hub controls its own surfaces independently.
 *
 * Plain server module (not "use server") so server components can import it.
 * Uses the service-role client for a single indexed PK lookup and FAILS CLOSED
 * (returns false) when the entitlement cannot be resolved.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function tenantReviewsEnabled(
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (!tenantId) return false;
  const svc = createServiceRoleClient();
  if (!svc) return false;
  try {
    const { data } = await svc
      .from("agency_entitlements")
      .select("reviews_enabled")
      .eq("tenant_id", tenantId)
      .returns<{ reviews_enabled: boolean | null }[]>()
      .maybeSingle();
    return data?.reviews_enabled === true;
  } catch {
    return false;
  }
}
