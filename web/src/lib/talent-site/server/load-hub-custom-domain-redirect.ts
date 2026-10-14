import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveTalentHubCustomDomainHomeRedirect } from "@/lib/talent-site/hub-custom-domain-redirect";

/**
 * Resolve the hub `/t/<code>` → custom-domain home 308 target for a profile.
 *
 * Only an ACTIVE primary custom domain on a Web Office plan qualifies — same
 * gate as `loadTalentMaxSiteLink` / `talent_site_domain_lookup`. Pending or
 * broken DNS never redirects (no outage bounce).
 */
export async function loadTalentHubCustomDomainHomeRedirect(input: {
  talentProfileId: string;
  platformHost: boolean;
  isModal: boolean;
  preview: string | undefined | null;
}): Promise<string | null> {
  // Gates that never need a DB round-trip.
  if (!input.platformHost || input.isModal || input.preview === "1") return null;

  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;

    const { data: profileRow, error: profileErr } = await admin
      .from("talent_profiles")
      .select("talent_plan_key")
      .eq("id", input.talentProfileId)
      .maybeSingle();
    if (profileErr || !profileRow) return null;
    if ((profileRow as { talent_plan_key: string | null }).talent_plan_key !== "talent_portfolio") {
      return null;
    }

    const { data: siteRow, error: siteErr } = await admin
      .from("talent_sites")
      .select("site_published_at")
      .eq("talent_profile_id", input.talentProfileId)
      .not("site_published_at", "is", null)
      .maybeSingle();
    if (siteErr || !siteRow) return null;

    const { data: domainRow, error: domainErr } = await admin
      .from("talent_site_domains")
      .select("domain")
      .eq("talent_profile_id", input.talentProfileId)
      .eq("is_primary", true)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (domainErr) return null;

    const domain = (domainRow as { domain?: string | null } | null)?.domain ?? null;
    return resolveTalentHubCustomDomainHomeRedirect({
      platformHost: true,
      isModal: false,
      preview: input.preview,
      primaryActiveCustomDomain: domain,
    });
  } catch {
    return null;
  }
}
