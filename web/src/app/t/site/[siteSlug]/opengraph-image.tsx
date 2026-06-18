import { notFound } from "next/navigation";

import { loadMaxSiteBySlug, loadTalentSiteIdentity } from "@/lib/talent-site/server/load-max-site";
import {
  buildSiteOgImage,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
} from "@/lib/talent-site/server/site-og-image";

// SEO-2 — link-preview card for the talent Max site `/t/site/[siteSlug]` (and,
// by segment inheritance, `/t/site/[siteSlug]/[pageSlug]`). Consumes the SHARED
// `buildSiteOgImage` generator so it never forks the custom-domain card.

export const alt = "Talent site";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  const site = await loadMaxSiteBySlug(siteSlug);
  if (!site) notFound();
  const identity = await loadTalentSiteIdentity(site.talentProfileId);
  return buildSiteOgImage({
    name: identity?.name ?? site.siteSlug ?? "Tulala",
    logoUrl: site.logoUrl,
  });
}
