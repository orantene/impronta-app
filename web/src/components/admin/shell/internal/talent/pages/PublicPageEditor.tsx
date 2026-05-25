"use client";

import { TalentSiteAppearancesPanel } from "@/components/talent/site/TalentSiteAppearancesPanel";
import { TalentSiteDashboardPanel } from "@/components/talent/site/TalentSiteDashboardPanel";
import { PageHeader } from "../shared/page-chrome-1";

/** My pages — agency roster links + Max personal-site builder. */
export function PublicPageEditor() {
  return (
    <>
      <PageHeader
        title="My pages"
        subtitle="Your owned Tulala personal site and every agency roster where clients can find you."
      />
      <TalentSiteDashboardPanel />
      <div style={{ height: 24 }} />
      <TalentSiteAppearancesPanel />
    </>
  );
}
