"use client";

import { TalentSiteAppearancesPanel } from "@/components/talent/site/TalentSiteAppearancesPanel";
import { TalentSiteDashboardPanel } from "@/components/talent/site/TalentSiteDashboardPanel";
import { talentSiteCopy } from "@/lib/talent-site/talent-site-i18n";
import { PageHeader } from "../shared/page-chrome-1";

type Props = {
  locale?: "en" | "es";
};

/** My site — talent-owned profile/site + roster appearances. */
export function PublicPageEditor({ locale = "en" }: Props) {
  return (
    <>
      <PageHeader
        title={talentSiteCopy(locale, "pageTitle")}
        subtitle={talentSiteCopy(locale, "pageSubtitle")}
      />
      <TalentSiteDashboardPanel locale={locale} />
      <div style={{ height: 24 }} />
      <TalentSiteAppearancesPanel locale={locale} />
    </>
  );
}
