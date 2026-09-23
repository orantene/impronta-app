import "server-only";

import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { publishSiteTheme, type ThemeApplyResult } from "./theme-apply-core";

/**
 * Publish the site theme (draft tokens -> live) as part of the site's own
 * "Publish site" (`publishMaxSiteAction`), so a Design + Look applied from the
 * gallery goes live together with the pages and shell it restyles.
 *
 * With TALENT_THEME_GALLERY_ENABLED off this is a no-op that never queries
 * (flags-off parity): `{ ok: true, data: null }`.
 */
export async function publishSiteThemeForTalent(input: {
  talentProfileId: string;
  profileCode: string | null;
}): Promise<ThemeApplyResult<{ themeVersion: number } | null>> {
  if (!isTalentThemeGalleryEnabled()) return { ok: true, data: null };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };
  const { data, error } = await admin
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talentTheme.publishHook.site", error);
    return { ok: false, code: "server_error", error: "Could not publish the theme." };
  }
  const siteId = (data as { id?: string } | null)?.id;
  if (!siteId) return { ok: false, code: "site_not_found", error: "Site not found." };
  return publishSiteTheme(admin, { siteId, profileCode: input.profileCode });
}
