import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Resolve the public Max site URL for a talent profile.
 *
 * Returns `{ url: string }` when:
 *   - the talent holds `talent_plan_key = 'talent_portfolio'` (Max), AND
 *   - the talent has a `talent_sites` row with `site_published_at` set.
 *
 * URL precedence:
 *   1. Primary active custom domain → `https://<domain>`
 *   2. Fallback → `/t/site/<site_slug>`
 *
 * Returns `null` when:
 *   - the talent is not on the Max plan, OR
 *   - the site has never been published (`site_published_at IS NULL`), OR
 *   - any error occurs (throw-safe — always degrades gracefully).
 */
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
      .select("talent_plan_key")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (profileErr || !profileRow) return null;

    const planKey = (profileRow as { talent_plan_key: string | null })
      .talent_plan_key;
    if (planKey !== "talent_portfolio") return null;

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

    if (customDomain) {
      return { url: `https://${customDomain}` };
    }

    // ── 3. Fallback to /t/site/<site_slug> ───────────────────────────────
    if (row.site_slug) {
      return { url: `/t/site/${encodeURIComponent(row.site_slug)}` };
    }

    return null;
  } catch {
    // Any error degrades gracefully — no badge shown, no crash.
    return null;
  }
}
