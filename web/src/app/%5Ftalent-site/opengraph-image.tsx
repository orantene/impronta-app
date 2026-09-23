import { notFound } from "next/navigation";
import { headers } from "next/headers";

import {
  HOST_CONTEXT_HEADER,
  HOST_TALENT_PROFILE_HEADER,
} from "@/lib/saas/host-context";
import {
  loadMaxSiteByProfileId,
  loadTalentSiteIdentity,
} from "@/lib/talent-site/server/load-max-site";
import {
  buildSiteOgImage,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
} from "@/lib/talent-site/server/site-og-image";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";

// SEO-2 — link-preview card for the talent custom-domain catch-all. Consumes the
// SAME shared `buildSiteOgImage` generator as the `/t/site/...` route, so the
// custom-domain surface is NOT a silent OG fork. The talent_profile_id is
// resolved through the same proxy-header gate the page uses (never from the URL).

export const alt = "Talent site";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

async function resolveTalentProfileId(): Promise<string | null> {
  try {
    const h = await headers();
    return resolveGatedTalentProfileId({
      hostContext: h.get(HOST_CONTEXT_HEADER),
      talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER),
    });
  } catch {
    return null;
  }
}

export default async function Image() {
  const talentProfileId = await resolveTalentProfileId();
  if (!talentProfileId) notFound();
  const [site, identity] = await Promise.all([
    loadMaxSiteByProfileId(talentProfileId),
    loadTalentSiteIdentity(talentProfileId),
  ]);
  return buildSiteOgImage({
    name: identity?.name ?? site?.siteSlug ?? "Tulala",
    logoUrl: site?.logoUrl ?? null,
  });
}
