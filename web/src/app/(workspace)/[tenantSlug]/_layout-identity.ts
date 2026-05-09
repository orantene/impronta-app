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
};

export async function loadTenantIdentity(
  tenantId: string,
): Promise<TenantIdentityPayload | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  // Run agency + branding lookups in parallel; branding is optional.
  const [agencyRes, brandingRes] = await Promise.all([
    admin
      .from("agencies")
      .select("id, slug, display_name, plan_tier, kind")
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("agency_branding")
      .select("theme_json")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  if (agencyRes.error || !agencyRes.data) {
    if (agencyRes.error) {
      logServerError("layout-identity.loadTenantIdentity", agencyRes.error);
    }
    return null;
  }
  const data = agencyRes.data;
  const themeJson = brandingRes.data?.theme_json as
    | { logo_url?: string }
    | null
    | undefined;
  const logoUrl =
    themeJson?.logo_url && typeof themeJson.logo_url === "string"
      ? themeJson.logo_url
      : null;
  return {
    tenantId: data.id,
    slug: data.slug ?? "",
    displayName: data.display_name ?? "Workspace",
    planTier: data.plan_tier ?? "free",
    kind: data.kind ?? "agency",
    logoUrl,
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
