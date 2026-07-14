import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Shared identity loaders used by BOTH the workspace admin layout and the
 * talent self-surface layout.
 *
 * Both surfaces need the same tenant-identity payload (display name,
 * slug, plan tier, kind, logo URL) and the same signed-in user's display
 * name to render the persistent identity bar. Defining the loaders in one
 * place avoids drift — when one layout was updated to read agency_branding
 * for the logo, the other was left behind and rendered the mock TENANT
 * default ("Atelier Roma") in production.
 */

export type TenantIdentityPayload = {
  tenantId: string;
  slug: string;
  displayName: string;
  planTier: string;
  kind: string;
  /** Brand logo URL — when set, replaces the "TULALA" wordmark in the
   *  identity bar. Stored in agency_branding.theme_json.logo_url for
   *  parity with the public storefront's branded chrome. */
  logoUrl: string | null;
  /**
   * The tenant's verified custom domain hostname, if any. Derived from
   * `agency_domains` where `kind='custom'` and `status IN ('verified',
   * 'ssl_provisioned', 'active')`. Null when no custom domain is verified.
   * Used by the Website settings TierCard to show the real domain instead
   * of inferring from the plan tier.
   */
  verifiedDomain: string | null;
  /**
   * F.1 — Workspace-level default coordinator (auto-assigned on new
   * inquiries). Null when unset (engine falls back to workspace owner).
   * UI surfaces a dropdown to change this only on Agency-tier workspaces.
   */
  defaultCoordinatorUserId: string | null;
  /**
   * Phase 5 — roster talent designated as default inquiry coordinators.
   * Every new inquiry adds all of them as `coordinator` participants so
   * they join the thread and manage the inquiry → booking flow. Empty
   * array when none are set.
   */
  inquiryCoordinatorTalentIds: string[];
  /**
   * ISO timestamp set at provisioning time when the workspace was created
   * with tier_interest='network'. Used to show the "Network setup pending"
   * banner in OverviewFree until setup is complete or dismissed.
   */
  networkRequestedAt: string | null;
  /**
   * TALENT SURFACE ONLY — true when the signed-in talent is EXCLUSIVELY
   * represented by this agency (their primary roster row). Set by the
   * platform talent layout; left undefined on the workspace admin surface
   * (where the agency's own staff always see their own brand regardless).
   * Whitelabel branding on the talent dashboard requires this AND the
   * agency being on a whitelabel plan tier.
   */
  talentExclusive?: boolean;
};

export async function loadTenantIdentity(
  tenantId: string,
): Promise<TenantIdentityPayload | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  // Run agency, branding, verified-custom-domain, and inquiry-coordinator
  // lookups in parallel.
  const [agencyRes, brandingRes, domainRes, coordTalentRes] = await Promise.all([
    admin
      .from("agencies")
      .select("id, slug, display_name, plan_tier, kind, default_coordinator_user_id, settings")
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("agency_branding")
      .select("theme_json")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    // Task 0.5: Fetch the tenant's verified custom domain (if any).
    // We consider a domain "live" when its status is 'verified',
    // 'ssl_provisioned', or 'active' — the three states that indicate
    // the domain is confirmed and serving traffic.
    admin
      .from("agency_domains")
      .select("hostname")
      .eq("tenant_id", tenantId)
      .eq("kind", "custom")
      .in("status", ["verified", "ssl_provisioned", "active"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Phase 5 — roster talent designated as default inquiry coordinators.
    admin
      .from("agency_inquiry_coordinators")
      .select("talent_profile_id")
      .eq("tenant_id", tenantId),
  ]);
  if (agencyRes.error || !agencyRes.data) {
    if (agencyRes.error) {
      logServerError("layout-identity.loadTenantIdentity", agencyRes.error);
    }
    return null;
  }
  const data = agencyRes.data as typeof agencyRes.data & { settings?: Record<string, unknown> | null };
  const themeJson = brandingRes.data?.theme_json as
    | { logo_url?: string }
    | null
    | undefined;
  const logoUrl =
    themeJson?.logo_url && typeof themeJson.logo_url === "string"
      ? themeJson.logo_url
      : null;
  const verifiedDomain =
    (domainRes.data as { hostname: string } | null)?.hostname ?? null;
  return {
    tenantId: data.id,
    slug: data.slug ?? "",
    displayName: data.display_name ?? "Workspace",
    planTier: data.plan_tier ?? "free",
    kind: data.kind ?? "agency",
    logoUrl,
    verifiedDomain,
    defaultCoordinatorUserId:
      (data as { default_coordinator_user_id?: string | null }).default_coordinator_user_id ?? null,
    inquiryCoordinatorTalentIds: (
      (coordTalentRes.data ?? []) as Array<{ talent_profile_id: string }>
    ).map((r) => r.talent_profile_id),
    networkRequestedAt:
      typeof data.settings?.network_requested_at === "string"
        ? data.settings.network_requested_at
        : null,
  };
}

export async function loadProfileDisplayName(
  userId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logServerError("layout-identity.loadProfileDisplayName", error);
    return null;
  }
  return data?.display_name ?? null;
}
