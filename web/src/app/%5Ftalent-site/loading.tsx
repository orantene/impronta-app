/**
 * Soft-nav / streaming first paint for talent custom-domain hosts (TUL-495).
 * Without this, `/en` stayed a blank white page while the Max-site RSC flight
 * (~1 MB) and font CSS finished. The skeleton is theme-core, not per-talent.
 */

import { TalentSitePaintSkeleton } from "@/components/talent-site/TalentSitePaintSkeleton";
import { getRequestLocale } from "@/i18n/request-locale";

export default async function TalentSiteHostLoading() {
  const locale = await getRequestLocale();
  return <TalentSitePaintSkeleton locale={locale} />;
}
