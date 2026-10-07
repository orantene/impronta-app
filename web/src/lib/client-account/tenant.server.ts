import "server-only";

import { headers } from "next/headers";

import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { loadTalentSiteInquiryTenant } from "@/lib/messaging/talent-inquiry-tenant.server";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type AccountTenant = { tenantId: string; slug: string; timeZone: string };

/**
 * The ONE tenant this popover speaks for: the inquiry tenant of the talent whose
 * site the visitor is on. On a talent host the profile id comes from the proxy
 * header; on `/t/<code>` the caller passes the public profile code. Anything
 * else returns null (fail closed): the client never chooses a tenant id.
 */
export async function resolveAccountTenant(profileCode?: string | null): Promise<AccountTenant | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  let profileId: string | null = null;
  try {
    const h = await headers();
    if (h.get(HOST_CONTEXT_HEADER) === "talent_site") {
      profileId = h.get(HOST_TALENT_PROFILE_HEADER)?.trim() || null;
    }
  } catch {
    return null;
  }
  const code = profileCode?.trim();
  if (!profileId && code) {
    const { data, error } = await admin.from("talent_profiles").select("id").eq("profile_code", code).maybeSingle();
    if (error) logServerError("clientAccount.tenant.profile", error);
    profileId = (data as { id?: string } | null)?.id ?? null;
  }
  if (!profileId) return null;
  const loaded = await loadTalentSiteInquiryTenant(admin, profileId);
  if (!loaded.ok) return null;
  const { data: ag, error: agErr } = await admin.from("agencies").select("timezone").eq("id", loaded.tenant.tenantId).maybeSingle();
  if (agErr) logServerError("clientAccount.tenant.timezone", agErr);
  const tz = (ag as { timezone?: string | null } | null)?.timezone?.trim() || "UTC";
  return { tenantId: loaded.tenant.tenantId, slug: loaded.tenant.slug, timeZone: tz };
}
