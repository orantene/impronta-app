"use client";

import { Suspense, useState } from "react";
import { TalentSiteAppearancesPanel } from "@/components/talent/site/TalentSiteAppearancesPanel";
import { TalentSiteDashboardPanel } from "@/components/talent/site/TalentSiteDashboardPanel";
import { TalentMaxSiteManager } from "@/components/talent/site/TalentMaxSiteManager";
import { DiscoverNetworksPanel } from "@/components/talent/studio/DiscoverNetworksPanel";
import { WebsiteEligibilityPanel } from "@/components/talent/studio/WebsiteEligibilityPanel";
import { WebOfficeReturnBanner } from "@/components/talent/studio/WebOfficeStates";
import { useTalentStudioV2 } from "@/components/talent/studio/flag";
import { talentSiteCopy } from "@/lib/talent-site/talent-site-i18n";
import { useAdminShell } from "../../state";
import { useDashboardText } from "../../dashboard-i18n";
import { PageHeader } from "../shared/page-chrome-1";

type Props = {
  locale?: "en" | "es";
};

type PresenceTab = "site" | "appear" | "nets";

/**
 * My site — talent-owned multi-page website (Max) + discovery profile/site +
 * roster appearances.
 *
 * Studio v2 splits those into three tabs: My website, Where I appear,
 * Discover networks. The flag-off screen keeps the stacked sections.
 */
export function PublicPageEditor({ locale = "en" }: Props) {
  const studio = useTalentStudioV2();
  const copy = useDashboardText();
  const { bridgeTalentSelfProfile } = useAdminShell();
  const [tab, setTab] = useState<PresenceTab>("site");
  if (!studio) {
    return (
      <>
        <PageHeader
          title={talentSiteCopy(locale, "pageTitle")}
          subtitle={talentSiteCopy(locale, "pageSubtitle")}
        />
        <LegacyPresence locale={locale} />
      </>
    );
  }
  const tabs: Array<{ id: PresenceTab; label: string }> = [
    { id: "site", label: copy.t("My website") },
    { id: "appear", label: copy.t("Where I appear") },
    { id: "nets", label: copy.t("Discover networks") },
  ];
  return (
    <>
      <PageHeader title={copy.t("My presence")} subtitle={copy.t("What the public sees")} />
      <div className="mb-4 flex gap-2" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${tab === item.id ? "bg-admin-ink text-white" : "bg-[rgba(11,11,13,0.06)] text-admin-ink"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "site" && (
        <>
          <Suspense fallback={null}>
            <WebOfficeReturnBanner />
          </Suspense>
          <WebsiteEligibilityPanel />
          <TalentMaxSiteManager locale={locale} />
          <div className="mt-8" />
          <TalentSiteDashboardPanel locale={locale} />
        </>
      )}
      {tab === "appear" && <TalentSiteAppearancesPanel locale={locale} />}
      {tab === "nets" && <DiscoverNetworksPanel talentId={bridgeTalentSelfProfile?.id ?? null} />}
    </>
  );
}

function LegacyPresence({ locale }: { locale: "en" | "es" }) {
  return (
    <>
      <SectionLabel
        eyebrow="Your multi-page website"
        hint="A full website with its own link, header, logo and footer, separate from your discovery profile. The starter gallery below sets up its home page and shell."
      />
      <TalentMaxSiteManager locale={locale} />

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
