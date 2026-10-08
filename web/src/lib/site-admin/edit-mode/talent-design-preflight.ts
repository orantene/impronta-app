import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { gate } from "@/lib/talent-site/server/site-action-gate";
import { maisonDesignBlocker } from "@/lib/talent-site/server/maison-publish-readiness";
import type { PreflightIssue } from "./publish-preflight-action";

/**
 * Blocker when the talent's never-published site has no design and the Maison
 * gate (`prepareMaisonSiteForPublish`) would refuse. Mirrors that gate: it only
 * runs on the first publish (`delegateFirstPublish`) and only when the Maison
 * flag is on. Fails open on read errors; the server stays the backstop.
 */
export async function talentDesignRequiredIssue(): Promise<PreflightIssue | null> {
  try {
    const g = await gate("personalSiteEdit");
    if (!g.ok || !isTalentMaisonThemeEnabled(g.talentProfileId)) return null;
    const sb = await getCachedServerSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("talent_sites")
      .select("theme_design_slug, site_published_at")
      .eq("talent_profile_id", g.talentProfileId)
      .maybeSingle();
    if (error) {
      // Fail open: the server-side publish gate stays the backstop.
      logServerError("publish-preflight.talentPage.design.read", error);
      return null;
    }
    const row = data as { theme_design_slug: string | null; site_published_at: string | null } | null;
    if (!row || row.site_published_at) return null;
    const blocker = maisonDesignBlocker(row.theme_design_slug, "en");
    if (!blocker) return null;
    return {
      severity: "error",
      category: "design",
      message: blocker.message,
      fixLabel: blocker.fixLabel,
      fixHref: `/talent/site${blocker.fixHref}`,
    };
  } catch (err) {
    logServerError("publish-preflight.talentPage.design", err);
    return null;
  }
}

