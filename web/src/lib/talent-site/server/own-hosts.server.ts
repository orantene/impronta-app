import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

import { platformSiteHosts } from "../canonical-own-host";

/**
 * #201 - every host an explicit `canonical_url` may name for this talent: the
 * custom domains in `talent_site_domains` plus the platform subdomain
 * (`<site_slug>.tulala.digital`). Throws on a domains read error; callers
 * degrade to [].
 */
export async function loadOwnHosts(talentProfileId: string): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const [domains, site, profile] = await Promise.all([
    admin.from("talent_site_domains").select("domain").eq("talent_profile_id", talentProfileId),
    admin.from("talent_sites").select("site_slug").eq("talent_profile_id", talentProfileId).maybeSingle(),
    admin.from("talent_profiles").select("is_demo").eq("id", talentProfileId).maybeSingle(),
  ]);
  if (domains.error) throw domains.error;
  const custom = ((domains.data ?? []) as Array<{ domain: string | null }>).map((r) => r.domain ?? "").filter(Boolean);
  // The platform subdomain is best-effort: a failed slug read must not drop the domains.
  const siteSlug = (site.data as { site_slug?: string | null } | null)?.site_slug ?? null;
  const isDemo = (profile.data as { is_demo?: boolean } | null)?.is_demo === true;
  return [...custom, ...platformSiteHosts(siteSlug, { isDemo })];
}
