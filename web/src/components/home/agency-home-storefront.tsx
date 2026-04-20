import { Suspense } from "react";
import { PublicHeader } from "@/components/public-header";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { HeroSearch } from "@/components/home/hero-search";
import { TalentTypeShortcuts } from "@/components/home/talent-type-shortcuts";
import { FeaturedTalentSection } from "@/components/home/featured-talent-section";
import { BestForSection } from "@/components/home/best-for-section";
import { LocationSection } from "@/components/home/location-section";
import { HowItWorks } from "@/components/home/how-it-works";
import { CtaSection } from "@/components/home/cta-section";
import { getHomepageData } from "@/lib/home-data";
import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import type { Locale } from "@/i18n/config";
import { createTranslator, getMessageStringArray } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicSettings } from "@/lib/public-settings";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { readGoogleMapsBrowserKey } from "@/lib/env/google-maps-browser-key";

/**
 * Agency-surface storefront (what was the old root homepage).
 *
 * Rendered by `app/page.tsx` when `hostContext.kind === "agency"`. The
 * tenant id comes from the host-context header that middleware set after
 * `agency_domains` lookup — never a runtime fallback.
 */
export async function AgencyHomeStorefront({ tenantId }: { tenantId: string }) {
  const locale: Locale = await getRequestLocale();
  const t = createTranslator(locale);
  const { talentTypes, featuredTalent, fitLabels, locations } =
    await getHomepageData({ tenantId });

  const [aiFlags, publicSettings] = await Promise.all([
    getAiFeatureFlags(),
    getPublicSettings(),
  ]);
  /** Home hero must match `/api/ai/interpret-search` gate (`directory_public`). */
  const aiHeroSearchEnabled =
    aiFlags.ai_master_enabled && aiFlags.ai_search_enabled && publicSettings.directoryPublic;
  const heroSearchCopy = {
    placeholder: t("public.home.hero.searchPlaceholder"),
    ariaLabel: t("public.home.hero.searchAria"),
    searchSubmit: t("public.home.hero.searchSubmit"),
    typedExamples: getMessageStringArray(locale, "public.home.hero.typedExamples"),
    interpreting: t("public.directory.ui.hero.interpreting"),
    interpretErrorTitle: t("public.directory.ui.hero.interpretErrorTitle"),
    interpretError: t("public.directory.ui.hero.interpretError"),
    interpretErrorDirectoryClosed: t("public.directory.ui.hero.interpretErrorDirectoryClosed"),
    interpretErrorAiDisabled: t("public.directory.ui.hero.interpretErrorAiDisabled"),
    interpretErrorService: t("public.directory.ui.hero.interpretErrorService"),
  };

  const howItWorksCopy = {
    sectionKicker: t("public.howItWorks.sectionKicker"),
    sectionTitle: t("public.howItWorks.sectionTitle"),
    step1Title: t("public.howItWorks.step1Title"),
    step1Body: t("public.howItWorks.step1Body"),
    step2Title: t("public.howItWorks.step2Title"),
    step2Body: t("public.howItWorks.step2Body"),
    step3Title: t("public.howItWorks.step3Title"),
    step3Body: t("public.howItWorks.step3Body"),
  };

  const ctaCopy = {
    title: t("public.cta.title"),
    body: t("public.cta.body"),
    searchTalent: t("public.cta.searchTalent"),
    createAccount: t("public.cta.createAccount"),
  };

  const featuredCopy = {
    sectionKicker: t("public.home.featured.sectionKicker"),
    sectionTitle: t("public.home.featured.sectionTitle"),
    viewAll: t("public.home.featured.viewAll"),
    viewAllMobile: t("public.home.featured.viewAllMobile"),
    brandPlaceholder: t("public.common.brand"),
  };

  const bestForCopy = {
    sectionKicker: t("public.home.bestFor.sectionKicker"),
    sectionTitle: t("public.home.bestFor.sectionTitle"),
    showMore: t("public.home.bestFor.showMore"),
    showLess: t("public.home.bestFor.showLess"),
  };

  const locationCopy = {
    sectionKicker: t("public.home.location.sectionKicker"),
    sectionTitle: t("public.home.location.sectionTitle"),
    talentCountOne: t("public.home.location.talentCountOne"),
    talentCountMany: t("public.home.location.talentCountMany"),
    viewTalents: t("public.home.location.viewTalents"),
    mapLoadErrorTitle: t("public.home.location.mapLoadErrorTitle"),
    mapLoadErrorBody: t("public.home.location.mapLoadErrorBody"),
    mapLoadErrorOpenConsole: t("public.home.location.mapLoadErrorOpenConsole"),
    mapPinPreviewAria: t("public.home.location.mapPinPreviewAria"),
    mapPinPreviewPhotoAlt: t("public.home.location.mapPinPreviewPhotoAlt"),
  };

  /** Same GCP key as Places is fine if Maps JavaScript API is enabled; public var overrides when set. */
  const mapsApiKey = readGoogleMapsBrowserKey();

  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <PublicDiscoveryStateProvider>
        <PublicFlashHost dismissAria={t("public.directory.ui.flash.dismissAria")} />
        <PublicHeader />
        <main className="flex flex-1 flex-col">
          <section className="relative flex flex-col items-center justify-center px-4 pb-6 pt-16 sm:px-6 sm:pb-12 sm:pt-28 lg:px-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(212,175,55,0.12),transparent)]"
            />
            <div className="relative w-full max-w-3xl text-center">
              <p className="font-display text-sm font-medium uppercase tracking-[0.35em] text-[var(--impronta-gold-dim)]">
                {t("public.home.hero.kicker")}
              </p>
              <h1 className="mt-6 font-display text-3xl font-normal leading-tight tracking-[0.06em] text-foreground sm:text-4xl md:text-5xl">
                {t("public.home.hero.titleBefore")}{" "}
                <span className="text-[var(--impronta-gold)]">
                  {t("public.home.hero.titleHighlight")}
                </span>{" "}
                {t("public.home.hero.titleAfter")}
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base text-[var(--impronta-muted)] sm:text-lg">
                {t("public.home.hero.subtitle")}
              </p>
              <div className="mt-10">
                <Suspense
                  fallback={
                    <div className="mx-auto w-full max-w-2xl">
                      <div className="relative h-14 rounded-xl border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 sm:h-16" />
                    </div>
                  }
                >
                  <HeroSearch
                    copy={heroSearchCopy}
                    aiSearchEnabled={aiHeroSearchEnabled}
                    locale={locale === "es" ? "es" : "en"}
                  />
                </Suspense>
              </div>
            </div>
          </section>

          <TalentTypeShortcuts
            types={talentTypes}
            locale={locale}
            sectionKicker={t("public.home.browseByType.sectionKicker")}
          />

          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <hr className="border-[var(--impronta-gold-border)]" />
          </div>

          <FeaturedTalentSection
            talent={featuredTalent}
            locale={locale}
            copy={featuredCopy}
          />

          <BestForSection labels={fitLabels} locale={locale} copy={bestForCopy} />

          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <hr className="border-[var(--impronta-gold-border)]" />
          </div>

          <LocationSection
            locations={locations}
            locale={locale}
            copy={locationCopy}
            mapsApiKey={mapsApiKey}
          />

          <HowItWorks copy={howItWorksCopy} />

          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <hr className="border-[var(--impronta-gold-border)]" />
          </div>

          <CtaSection locale={locale} copy={ctaCopy} />

          <footer className="border-t border-border px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center text-sm text-[var(--impronta-muted)]">
              <PublicCmsFooterNav locale={locale} />
              <p className="font-display text-m tracking-[0.2em] text-foreground">
                IMPRONTA
              </p>
              <p>{t("public.home.footer.tagline")}</p>
              <p>
                {t("public.home.footer.copyright").replace("{year}", String(year))}
              </p>
            </div>
          </footer>
        </main>
      </PublicDiscoveryStateProvider>
    </div>
  );
}
