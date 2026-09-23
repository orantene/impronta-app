import "server-only";

import { TalentProfileChatLauncherMount } from "@/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount";
import { loadTalentSiteInquiryTenant } from "@/lib/messaging/talent-inquiry-tenant.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Guest Messages dock for a talent vanity host. The tenant is resolved on
 * the server from the talent profile id and passed into the mount for
 * server-side reads only. `exposeTenantToClient={false}` keeps that id out
 * of the client bundle; guest actions re-read the host header.
 */
export async function TalentSiteMessagesDock({
  talentProfileId,
  locale,
}: {
  talentProfileId: string;
  locale: string;
}) {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [resolved, profileRes] = await Promise.all([
    loadTalentSiteInquiryTenant(admin, talentProfileId),
    admin
      .from("talent_profiles")
      .select("profile_code, display_name")
      .eq("id", talentProfileId)
      .maybeSingle(),
  ]);
  if (!resolved.ok) return null;
  const profile = profileRes.data as { profile_code: string | null; display_name: string | null } | null;
  const code = profile?.profile_code?.trim();
  if (!code) return null;
  const displayName = profile?.display_name?.trim() || code;

  return (
    <TalentProfileChatLauncherMount
      talentProfileId={talentProfileId}
      talentProfileCode={code}
      talentDisplayName={displayName}
      tenantSlug={resolved.tenant.slug}
      tenantId={resolved.tenant.tenantId}
      exposeTenantToClient={false}
      agencyName={resolved.tenant.displayName}
      sourcePage="/"
      locale={locale}
    />
  );
}
