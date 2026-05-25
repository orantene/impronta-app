"use client";

import { TalentSiteAppearancesPanel } from "@/components/talent/site/TalentSiteAppearancesPanel";
import { TalentSiteDashboardPanel } from "@/components/talent/site/TalentSiteDashboardPanel";

/** My pages — agency roster links + Max personal-site builder. */
export function PublicPageEditor() {
  return (
    <>
      <TalentSiteAppearancesPanel />
      <TalentSiteDashboardPanel />
    </>
  );
}
