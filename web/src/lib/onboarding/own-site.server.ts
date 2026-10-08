import "server-only";

/**
 * The "talent's own free site exists, is published, has an address" step,
 * shared by the build path (`provision-for-choice.server.ts`) and the studio
 * owner's "also take bookings myself" conversion (TUL-269). Best-effort by
 * contract: a failure returns `{ ok: false }`, never throws.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import { getAppUrl } from "@/lib/auth-flow";
import { logServerError } from "@/lib/server/safe-error";
import { applyMaisonDesignAction } from "@/lib/talent-site/server/maison-apply-actions";
import { provisionTalentPersonalSiteIfMissing } from "@/lib/talent-site/server/provision";
import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";

import { onboardingDesignApplyInput } from "./design-apply-input";
import type { DesignLookKey } from "./finish-url";
import { ensureOwnSitePublished } from "./publish-own-site";

export async function ensureOwnTalentSite(
  admin: SupabaseClient,
  args: { userId: string; talentProfileId: string; designPaletteKey?: DesignLookKey | null },
): Promise<{ ok: true; publicUrl: string | null } | { ok: false; error: string }> {
  const { userId, talentProfileId, designPaletteKey } = args;
  const apex = getAppUrl().replace(/^https?:\/\/app\./, "https://");
  const draft = await provisionTalentPersonalSiteIfMissing(talentProfileId, "free", userId);
  if (!draft.ok) logServerError("onboarding.ownSite.siteDraft", new Error(draft.error));
  const own = await ensureOwnSitePublished({
    subdomainsEnabled: isTalentSiteSubdomainsEnabled(),
    pathOrigin: apex,
    readSite: async () => {
      const [site, prof] = await Promise.all([
        admin.from("talent_sites").select("site_slug, site_published_at, theme_design_slug").eq("talent_profile_id", talentProfileId).maybeSingle(),
        admin.from("talent_profiles").select("is_demo").eq("id", talentProfileId).maybeSingle(),
      ]);
      if (site.error) return { row: null, isDemo: false, error: site.error.message };
      return { row: site.data ?? null, isDemo: Boolean((prof.data as { is_demo?: boolean } | null)?.is_demo) };
    },
    forceDesign: !!designPaletteKey,
    applyDefaultDesign: () => applyMaisonDesignAction(onboardingDesignApplyInput(designPaletteKey)),
    publish: () => publishMaxSiteAction(),
  }).catch((err) => ({ ok: false as const, error: String(err) }));
  if (!own.ok) {
    logServerError("onboarding.ownSite.publish", new Error(own.error));
    return { ok: false, error: own.error };
  }
  return { ok: true, publicUrl: own.publicUrl };
}
