import "server-only";

import { headers } from "next/headers";

import { getRequestLocale } from "@/i18n/request-locale";
import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { talentNotFoundCopy, type TalentNotFoundCopy } from "@/lib/talent-site/talent-not-found-copy";
import { loadTalentSiteIdentity } from "@/lib/talent-site/server/load-max-site";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";

/**
 * GRK-028 — 404 copy for the current talent site host, or null when the
 * request is not on a talent_site host (callers keep their platform 404).
 */
export async function loadTalentNotFoundCopy(): Promise<TalentNotFoundCopy | null> {
  let talentProfileId: string | null = null;
  try {
    const h = await headers();
    if (h.get(HOST_CONTEXT_HEADER) !== "talent_site") return null;
    talentProfileId = resolveGatedTalentProfileId({
      hostContext: h.get(HOST_CONTEXT_HEADER),
      talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER),
    });
  } catch {
    return null;
  }
  const [locale, identity] = await Promise.all([
    getRequestLocale(),
    talentProfileId ? loadTalentSiteIdentity(talentProfileId).catch(() => null) : null,
  ]);
  return talentNotFoundCopy(locale, identity?.name ?? null);
}
