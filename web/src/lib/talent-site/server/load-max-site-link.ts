import "server-only";

import { resolveEffectiveTalentPlanKey } from "@/lib/billing/effective-talent-plan";
import { hasEntitlement } from "@/lib/access/talent-entitlements";
import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveMaxSiteLinkUrl } from "@/lib/talent-site/max-site-link-url";

/**
 * Resolve the public Max site URL for a talent profile.
 *
 * Returns `{ url: string }` when:
 *   - the talent holds `talent_plan_key = 'talent_portfolio'` (Max), AND
 *   - the talent has a `talent_sites` row with `site_published_at` set.
 *
 * URL precedence:
 *   1. Primary active custom domain → `https://<domain>`
 *   2. `https://<site_slug>.tulala.digital` when subdomains are enabled
 *   3. Fallback → `/t/site/<site_slug>`
 *
 * Returns `null` when:
 *   - the talent is not on the Max plan, OR
 *   - the site has never been published (`site_published_at IS NULL`), OR
 *   - any error occurs (throw-safe — always degrades gracefully).
 */
/**
 * The address her site publishes to, on any plan and before a first publish
 * (the builder's publish drawer names it). Same precedence as the hub link.
 * Null when she has no site or on any error.
 */
export async function loadTalentSiteAddress(talentProfileId: string): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const [siteRes, profileRes, domainRes] = await Promise.all([
      admin.from("talent_sites").select("site_slug").eq("talent_profile_id", talentProfileId).maybeSingle(),
      admin.from("talent_profiles").select("is_demo").eq("id", talentProfileId).maybeSingle(),
      admin
        .from("talent_site_domains")
        .select("domain")
        .eq("talent_profile_id", talentProfileId)
        .eq("is_primary", true)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);
    if (siteRes.error || profileRes.error || domainRes.error) return null;
    const siteSlug = (siteRes.data as { site_slug: string | null } | null)?.site_slug ?? null;
    if (!siteSlug) return null;
    return resolveMaxSiteLinkUrl({
      customDomain: (domainRes.data as { domain: string | null } | null)?.domain ?? null,
      siteSlug,
      isDemo: (profileRes.data as { is_demo?: boolean | null } | null)?.is_demo === true,
      subdomainsEnabled: isTalentSiteSubdomainsEnabled(),
    });
  } catch {
    return null;
  }
}

export async function loadTalentMaxSiteLink(
  talentProfileId: string,
): Promise<{ url: string } | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;

    // ── 1. Check Max plan + published site in one query ───────────────────
    const { data: siteRow, error: siteErr } = await admin
      .from("talent_sites")
      .select("site_slug, site_published_at")
      .eq("talent_profile_id", talentProfileId)
      .not("site_published_at", "is", null)
      .maybeSingle();

    if (siteErr || !siteRow) return null;

    // `talent_plan_key` lives on talent_profiles. Read it via the service role
    // so even a private / non-anon-readable row can be checked.
    const { data: profileRow, error: profileErr } = await admin
      .from("talent_profiles")
      .select("talent_plan_key, is_demo")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (profileErr || !profileRow) return null;

    const planKey = await resolveEffectiveTalentPlanKey(
      admin,
      talentProfileId,
      (profileRow as { talent_plan_key: string | null }).talent_plan_key,
    );
    if (!hasEntitlement(planKey, "personalSite.link")) return null;
    const isDemo = (profileRow as { is_demo?: boolean | null }).is_demo === true;

    const row = siteRow as {
      site_slug: string | null;
      site_published_at: string | null;
    };

    if (!row.site_published_at) return null;

    // ── 2. Prefer primary active custom domain ────────────────────────────
    const { data: domainRow } = await admin
      .from("talent_site_domains")
      .select("domain, status, is_primary")
      .eq("talent_profile_id", talentProfileId)
      .eq("is_primary", true)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const customDomain = domainRow
      ? (domainRow as { domain: string | null }).domain
      : null;

    const url = resolveMaxSiteLinkUrl({
      customDomain,
      siteSlug: row.site_slug,
      isDemo,
      subdomainsEnabled: isTalentSiteSubdomainsEnabled(),
    });
    return url ? { url } : null;
  } catch {
    // Any error degrades gracefully — no badge shown, no crash.
    return null;
  }
}
