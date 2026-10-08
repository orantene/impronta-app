import "server-only";

import { headers } from "next/headers";

import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { logServerError } from "@/lib/server/safe-error";
import { designTokensToCssVars, designTokensToDataAttrs } from "@/lib/site-admin/tokens/resolve";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadMaxSiteDesignSlug, loadMaxSiteThemeTokens } from "@/lib/talent-site/server/load-max-site";
import { designTokenDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";

export type AccountSite = {
  talentProfileId: string;
  talentName: string;
  profileCode: string | null;
  tokens: Record<string, string>;
  cssVars: Record<string, string>;
  dataAttrs: Record<string, string>;
};

/** Host kind and talent id exactly as the proxy set them. Never from the URL or the browser. */
export async function readAccountHost(): Promise<{ hostContext: string | null; talentProfileId: string | null }> {
  try {
    const h = await headers();
    return {
      hostContext: h.get(HOST_CONTEXT_HEADER),
      talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER)?.trim() || null,
    };
  } catch {
    return { hostContext: null, talentProfileId: null };
  }
}

/** The talent's name and effective design tokens, so `/account` wears the site's look. */
export async function loadAccountSite(talentProfileId: string): Promise<AccountSite> {
  const admin = createServiceRoleClient();
  let talentName = "";
  let profileCode: string | null = null;
  if (admin) {
    const { data, error } = await admin
      .from("talent_profiles")
      .select("display_name, profile_code")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (error) logServerError("clientAccount.area.talent", error);
    const row = data as { display_name?: string | null; profile_code?: string | null } | null;
    talentName = row?.display_name?.trim() || "";
    profileCode = row?.profile_code ?? null;
  }
  let tokens: Record<string, string> = {};
  try {
    const [siteTokens, slug, platform] = await Promise.all([
      loadMaxSiteThemeTokens(talentProfileId, { draft: false }),
      loadMaxSiteDesignSlug(talentProfileId),
      loadPlatformDefaultTheme("talent"),
    ]);
    tokens = resolveEffectiveSiteTokens({}, siteTokens, platform.tokens, designTokenDefaults(slug));
  } catch (error) {
    logServerError("clientAccount.area.tokens", error);
  }
  const hasTokens = Object.keys(tokens).length > 0;
  const cssVars = hasTokens ? designTokensToCssVars(tokens) : {};
  const heading = tokens["typography.heading-font-family"]?.trim();
  const body = tokens["typography.body-font-family"]?.trim();
  if (heading) cssVars["--site-heading-font"] = heading;
  if (body) cssVars["--site-body-font"] = body;
  return {
    talentProfileId,
    talentName,
    profileCode,
    tokens,
    cssVars,
    dataAttrs: hasTokens ? designTokensToDataAttrs(tokens) : {},
  };
}
