import "server-only";

import { headers } from "next/headers";

import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { TENANT_HEADER_NAME } from "@/lib/saas/scope";
import { loadTalentSiteInquiryTenant } from "@/lib/messaging/talent-inquiry-tenant.server";
import { logServerError } from "@/lib/server/safe-error";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { clientAccountEnabledFor } from "./flag";
import { decideAccountTenantSource, type AccountTenantSource } from "./tenant-source";

export type AccountTenant = { tenantId: string; slug: string; timeZone: string };

async function readSource(): Promise<{ decision: AccountTenantSource | null; talentProfileId: string | null; hostTenantId: string | null }> {
  try {
    const h = await headers();
    const talentProfileId = h.get(HOST_TALENT_PROFILE_HEADER)?.trim() || null;
    const hostTenantId = h.get(TENANT_HEADER_NAME)?.trim() || null;
    return {
      decision: decideAccountTenantSource({ hostKind: h.get(HOST_CONTEXT_HEADER), talentProfileId, hostTenantId }),
      talentProfileId,
      hostTenantId,
    };
  } catch {
    return { decision: null, talentProfileId: null, hostTenantId: null };
  }
}

/**
 * True when the client account surface is on for THIS request's host: the flag
 * named by the host decision (`talent` on a talent site, `app` on hub/agency/app
 * hosts, so the `/t/<code>` profile page). Unknown host: false.
 */
export async function accountSurfaceEnabledForRequest(): Promise<boolean> {
  const { decision } = await readSource();
  return decision ? clientAccountEnabledFor(decision.flag) : false;
}

/**
 * The ONE tenant a client account speaks for, from the HOST only (proxy-set
 * headers, stripped when inbound): the talent's tenant on her own site, the hub
 * or agency tenant on `/t/<code>`. Never a browser value or a profile code.
 * Anything else returns null (fail closed).
 */
export async function resolveAccountTenant(): Promise<AccountTenant | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { decision, talentProfileId, hostTenantId } = await readSource();
  if (!decision) return null;
  let tenantId: string | null = null;
  let slug = "";
  if (decision.source === "talent_profile" && talentProfileId) {
    const loaded = await loadTalentSiteInquiryTenant(admin, talentProfileId);
    if (!loaded.ok) return null;
    tenantId = loaded.tenant.tenantId;
    slug = loaded.tenant.slug;
  } else if (decision.source === "host_tenant" && hostTenantId) {
    tenantId = hostTenantId;
  } else if (decision.source === "platform_hub") {
    tenantId = (await getPlatformHubTenant())?.tenantId ?? null;
  }
  if (!tenantId) return null;
  const { data: ag, error } = await admin.from("agencies").select("slug, timezone").eq("id", tenantId).maybeSingle();
  if (error) logServerError("clientAccount.tenant.agency", error);
  const row = ag as { slug?: string | null; timezone?: string | null } | null;
  if (decision.source !== "talent_profile" && !row) return null;
  return { tenantId, slug: slug || row?.slug?.trim() || "", timeZone: row?.timezone?.trim() || "UTC" };
}
