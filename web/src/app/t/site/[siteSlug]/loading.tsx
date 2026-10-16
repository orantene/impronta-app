/**
 * Soft-nav / streaming first paint for `/t/site/[siteSlug]` (TUL-495).
 * Same shell as the custom-domain host loading UI.
 */

import { TalentSitePaintSkeleton } from "@/components/talent-site/TalentSitePaintSkeleton";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function TalentMaxSiteLoading() {
  const locale = await getRequestLocale();
  return <TalentSitePaintSkeleton locale={locale} />;
}
