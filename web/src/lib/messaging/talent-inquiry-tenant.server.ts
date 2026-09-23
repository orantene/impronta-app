import "server-only";

import { headers } from "next/headers";

import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";

import {
  pickTalentSiteInquiryTenant,
  type TalentInquiryTenantReason,
  type TalentRosterFact,
} from "./talent-inquiry-tenant";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type TalentSiteInquiryTenant = {
  readonly tenantId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly seller: "hub" | "agency";
  readonly reason: TalentInquiryTenantReason;
};

/**
 * Load the tenant that owns inquiries for this talent on her own site.
 * Roster rows come from `agency_talent_roster`. The hub id comes from
 * `getPlatformHubTenant` (never a hardcoded uuid).
 */
export async function loadTalentSiteInquiryTenant(
  admin: Admin,
  talentProfileId: string,
): Promise<{ ok: true; tenant: TalentSiteInquiryTenant } | { ok: false; reason: "no_hub" | "unavailable" }> {
  const hub = await getPlatformHubTenant();
  const { data, error } = await admin
    .from("agency_talent_roster")
    .select("tenant_id, status, agency_visibility, talent_site_hidden")
    .eq("talent_profile_id", talentProfileId);
  if (error) return { ok: false, reason: "unavailable" };
  const rosters: TalentRosterFact[] = (data ?? []).map((row: {
    tenant_id: string;
    status: string;
    agency_visibility: string;
    talent_site_hidden: boolean | null;
  }) => ({
    tenantId: row.tenant_id,
    status: row.status,
    agencyVisibility: row.agency_visibility,
    talentSiteHidden: row.talent_site_hidden === true,
  }));
  const pick = pickTalentSiteInquiryTenant({ hubTenantId: hub?.tenantId ?? null, rosters });
  if (!pick.ok) return pick;

  if (pick.seller === "hub" && hub && hub.tenantId === pick.tenantId) {
    return {
      ok: true,
      tenant: {
        tenantId: hub.tenantId,
        slug: hub.slug,
        displayName: hub.displayName,
        seller: "hub",
        reason: pick.reason,
      },
    };
  }

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .select("id, slug, display_name")
    .eq("id", pick.tenantId)
    .maybeSingle();
  if (agencyError || !agency?.slug) return { ok: false, reason: "unavailable" };
  const row = agency as { id: string; slug: string; display_name: string | null };
  return {
    ok: true,
    tenant: {
      tenantId: row.id,
      slug: row.slug,
      displayName: row.display_name?.trim() || row.slug,
      seller: pick.seller,
      reason: pick.reason,
    },
  };
}

/**
 * When the request host is `talent_site`, the inquiry tenant is the resolver
 * above (profile id from the proxy header). Any other host returns `other`
 * so the caller keeps resolving from the storefront slug. A talent host that
 * cannot be resolved returns a null tenant id: fail closed, do not fall
 * through to a client-supplied slug.
 */
export async function resolveTalentSiteHostTenant(
  admin: Admin,
): Promise<
  | { kind: "other" }
  | { kind: "talent_site"; tenantId: string | null; slug: string | null }
> {
  let hostKind: string | null = null;
  let profileId: string | null = null;
  try {
    const h = await headers();
    hostKind = h.get(HOST_CONTEXT_HEADER);
    profileId = h.get(HOST_TALENT_PROFILE_HEADER)?.trim() || null;
  } catch {
    return { kind: "other" };
  }
  if (hostKind !== "talent_site") return { kind: "other" };
  if (!profileId) return { kind: "talent_site", tenantId: null, slug: null };
  const loaded = await loadTalentSiteInquiryTenant(admin, profileId);
  if (!loaded.ok) return { kind: "talent_site", tenantId: null, slug: null };
  return { kind: "talent_site", tenantId: loaded.tenant.tenantId, slug: loaded.tenant.slug };
}
