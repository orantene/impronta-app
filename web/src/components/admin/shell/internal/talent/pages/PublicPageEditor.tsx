"use client";

import { TalentFaqEditor } from "@/components/talent/site/TalentFaqEditor";
import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { TalentSiteAppearancesPanel } from "@/components/talent/site/TalentSiteAppearancesPanel";
import { TalentSiteDashboardPanel } from "@/components/talent/site/TalentSiteDashboardPanel";
import { TalentMaxSiteManager } from "@/components/talent/site/TalentMaxSiteManager";
import { AvailableBlocks } from "@/components/talent/site/theme-update/AvailableBlocks";
import { ThemeUpdateNotice } from "@/components/talent/site/theme-update/ThemeUpdateNotice";
import { MaxSiteSettingsPanels } from "@/components/talent/site/TalentMaxSiteSettingsPanels";
import { DiscoverNetworksPanel } from "@/components/talent/studio/DiscoverNetworksPanel";
import { WebOfficeReturnBanner } from "@/components/talent/studio/WebOfficeStates";
import { useTalentStudioV2 } from "@/components/talent/studio/flag";
import { NavRow } from "@/components/talent/website-settings/primitives";
import { loadWebsiteSettingsEnabledAction } from "@/components/talent/website-settings/website-settings-gate-action";
import { takeOr } from "@/components/talent/site/public-page-bootstrap";
import {
  takeWebsiteSettingsIntent,
  type WebsiteSettingsIntentView,
} from "@/components/talent/website-settings/website-settings-intent";
import { talentSiteCopy } from "@/lib/talent-site/talent-site-i18n";
import { useAdminShell } from "../../state";
import { useDashboardText } from "../../dashboard-i18n";
import { PageHeader } from "../shared/page-chrome-1";

// Loaded on tap only: keeps the settings screen out of the admin workspace bundle.
const WebsiteSettingsScreen = dynamic(
  () =>
    import("@/components/talent/website-settings/WebsiteSettingsScreen").then(
      (m) => m.WebsiteSettingsScreen,
    ),
  { ssr: false },
);

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
  // PR 7: "Manage languages" / "Change in Website settings" deep-link here.
  const [intent] = useState<WebsiteSettingsIntentView | null>(() => takeWebsiteSettingsIntent());
  const [settingsOpen, setSettingsOpen] = useState(intent !== null);
  const [faqOpen, setFaqOpen] = useState(false);
  // Dark launch (TALENT_WEBSITE_SETTINGS_ENABLED): flag off → no entry row, no screen.
  const [settingsEnabled, setSettingsEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    void takeOr("settingsEnabled", "editor", loadWebsiteSettingsEnabledAction)
      .then((on) => {
        if (live) setSettingsEnabled(on);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const talentId = settingsEnabled ? (bridgeTalentSelfProfile?.id ?? null) : null;
  if (settingsOpen && talentId) {
    return <WebsiteSettingsScreen talentId={talentId} initialView={intent ?? undefined} onClose={() => setSettingsOpen(false)} />;
  }
  const settingsEntry = talentId ? (
    <div className="mb-5 overflow-hidden rounded-xl border border-admin-border-soft bg-white">
      <NavRow
        title={copy.t("Website settings")}
        summary={copy.t("Address, logo, pages, booking, payments and cancelling")}
        onOpen={() => setSettingsOpen(true)}
      />
    </div>
  ) : null;
  if (!studio) {
    return (
      <>
        <PageHeader
          title={talentSiteCopy(locale, "pageTitle")}
          subtitle={talentSiteCopy(locale, "pageSubtitle")}
        />
        <ThemeUpdateNotice surface="presence" locale={locale} />
        <AvailableBlocks locale={locale} />
        {settingsEntry}
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
      <div className="mb-5 flex gap-5 border-b border-admin-border-soft" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px min-h-11 border-b-[2.5px] px-0.5 text-[14px] font-semibold ${tab === item.id ? "border-admin-brand text-admin-brand" : "border-transparent text-admin-ink-muted hover:text-admin-ink"}`}
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
          <ThemeUpdateNotice surface="presence" locale={locale} />
          <AvailableBlocks locale={locale} />
          {/* Wave 3: hero + tiles on the manager; FAQ / settings open from tiles.
              Domain tile is entitlement-gated inside TalentMaxSiteManager. */}
          <TalentMaxSiteManager
            locale={locale}
            hideDomainRow
            onOpenQuestions={() => setFaqOpen(true)}
            onOpenSettings={() => {
              if (talentId) setSettingsOpen(true);
            }}
          />
          {faqOpen ? (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-black/30"
              data-testid="presence-faq-sheet"
            >
              <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-admin-border-soft px-4 py-3">
                  <h2 className="text-[16px] font-semibold text-admin-ink">
                    {copy.t("Questions and answers")}
                  </h2>
                  <button
                    type="button"
                    aria-label={copy.t("Close")}
                    onClick={() => setFaqOpen(false)}
                    className="grid h-11 w-11 place-items-center text-[18px]"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-auto px-4 py-3">
                  <TalentFaqEditor />
                </div>
              </div>
            </div>
          ) : null}
          {/* Flag on: NavRow → WebsiteSettingsScreen. MyWebsiteCard (Settings tile)
              only mounts after first publish — keep this entry before then.
              Flag off: collapsed MaxSiteSettingsPanels fallback. */}
          {talentId ? (
            settingsEntry
          ) : (
            <details className="mt-6 rounded-xl border border-admin-border-soft bg-white font-admin-body">
              <summary className="min-h-11 cursor-pointer px-4 py-3 text-[15px] font-semibold text-admin-ink">
                {copy.t("Website settings")}
              </summary>
              <div className="px-4 pb-4">
                <MaxSiteSettingsPanels />
              </div>
            </details>
          )}
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
      <div className="mt-4" />
      <MaxSiteSettingsPanels />

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
