"use client";

import { TalentSiteAppearancesPanel } from "@/components/talent/site/TalentSiteAppearancesPanel";
import { TalentSiteDashboardPanel } from "@/components/talent/site/TalentSiteDashboardPanel";
import { TalentMaxSiteManager } from "@/components/talent/site/TalentMaxSiteManager";
import { talentSiteCopy } from "@/lib/talent-site/talent-site-i18n";
import { PageHeader } from "../shared/page-chrome-1";

type Props = {
  locale?: "en" | "es";
};

/** My site — talent-owned multi-page website (Max) + profile/site + roster appearances. */
export function PublicPageEditor({ locale = "en" }: Props) {
  return (
    <>
      <PageHeader
        title={talentSiteCopy(locale, "pageTitle")}
        subtitle={talentSiteCopy(locale, "pageSubtitle")}
      />
      {/* Multi-page Talent Max website manager (pages + shell + logo + publish). */}
      <TalentMaxSiteManager locale={locale} />
      <div className="mt-6" />
      <TalentSiteDashboardPanel locale={locale} />
      <div className="mt-6" />
      <TalentSiteAppearancesPanel locale={locale} />
    </>
  );
}
