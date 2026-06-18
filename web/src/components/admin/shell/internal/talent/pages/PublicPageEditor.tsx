"use client";

import { TalentSiteAppearancesPanel } from "@/components/talent/site/TalentSiteAppearancesPanel";
import { TalentSiteDashboardPanel } from "@/components/talent/site/TalentSiteDashboardPanel";
import { TalentMaxSiteManager } from "@/components/talent/site/TalentMaxSiteManager";
import { talentSiteCopy } from "@/lib/talent-site/talent-site-i18n";
import { PageHeader } from "../shared/page-chrome-1";

type Props = {
  locale?: "en" | "es";
};

/**
 * My site — talent-owned multi-page website (Max) + discovery profile/site +
 * roster appearances.
 *
 * The two template systems (the Max multi-page-site starter gallery and the
 * discovery-profile slot-template picker) both render the SHARED
 * TemplatePickerPanel (ONB-3). This screen labels each section so a talent
 * understands which picker drives which surface — the multi-page Max website vs
 * the single-page discovery profile.
 */
export function PublicPageEditor({ locale = "en" }: Props) {
  return (
    <>
      <PageHeader
        title={talentSiteCopy(locale, "pageTitle")}
        subtitle={talentSiteCopy(locale, "pageSubtitle")}
      />

      {/* Section 1 — the multi-page Talent Max website (its own link, header,
          logo, footer, pages + a starter-template gallery). */}
      <SectionLabel
        eyebrow="Your multi-page website"
        hint="A full website with its own link, header, logo and footer, separate from your discovery profile. The starter gallery below sets up its home page and shell."
      />
      <TalentMaxSiteManager locale={locale} />

      {/* Section 2 — the discovery profile shown at /t/<code> (a single page; the
          template here styles that profile, not the multi-page site above). */}
      <div className="mt-8" />
      <SectionLabel
        eyebrow="Your discovery profile"
        hint="The single page clients land on from Discover, at /t/<your code>. The template here restyles that profile — it does not change your multi-page website above."
      />
      <TalentSiteDashboardPanel locale={locale} />

      <div className="mt-8" />
      <TalentSiteAppearancesPanel locale={locale} />
    </>
  );
}

function SectionLabel({ eyebrow, hint }: { eyebrow: string; hint: string }) {
  return (
    <div className="mt-5 mb-2.5">
      <div className="text-[13px] font-bold uppercase tracking-wide text-[color:var(--ink,#0B0B0D)]">
        {eyebrow}
      </div>
      <p className="mt-1 max-w-[640px] text-[12.5px] leading-normal text-[color:var(--ink-muted,rgba(11,11,13,0.72))]">
        {hint}
      </p>
    </div>
  );
}
