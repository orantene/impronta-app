import { Suspense } from "react";
import type { Metadata } from "next";

import { MergeGuestFavorites } from "@/app/(dashboard)/client/merge-guest";
import { DirectoryAnalyticsMount } from "@/components/analytics/directory-analytics-mount";
import { DirectoryDiscoverSection } from "@/components/directory/directory-discover-section";
import { DirectoryInquiryUrlSync } from "@/components/directory/directory-inquiry-url-sync";
import { HeroSearch } from "@/components/home/hero-search";
import { DiscoveryStateBridge } from "@/components/directory/public-discovery-state";
import {
  DirectoryFiltersSkeleton,
  DirectoryGridSkeleton,
} from "@/components/directory/directory-skeleton";
import { PublicHeader } from "@/components/public-header";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { getPublicSettings } from "@/lib/public-settings";
import { getSavedTalentIds } from "@/lib/public-discovery";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createTranslator, getMessageStringArray } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildPublicPageMetadata } from "@/lib/seo/public-metadata";
import { parseDirectoryQuery } from "@/lib/directory/search-params";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return buildPublicPageMetadata("directory", locale);
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const heroSearchCopy = {
    placeholder: t("public.home.hero.searchPlaceholder"),
    ariaLabel: t("public.home.hero.searchAria"),
    searchSubmit: t("public.directory.ui.hero.searchSubmit"),
    typedExamples: getMessageStringArray(locale, "public.home.hero.typedExamples"),
    interpreting: t("public.directory.ui.hero.interpreting"),
    interpretErrorTitle: t("public.directory.ui.hero.interpretErrorTitle"),
    interpretError: t("public.directory.ui.hero.interpretError"),
    interpretErrorDirectoryClosed: t("public.directory.ui.hero.interpretErrorDirectoryClosed"),
    interpretErrorAiDisabled: t("public.directory.ui.hero.interpretErrorAiDisabled"),
    interpretErrorService: t("public.directory.ui.hero.interpretErrorService"),
  };

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PublicHeader />
        <div className="mx-auto max-w-lg flex-1 px-4 py-20 text-center">
          <h1 className="text-xl font-semibold">
            {t("public.directory.configMissingTitle")}
          </h1>
          <p className="mt-3 text-m text-[var(--impronta-muted)]">
            {t("public.directory.configMissingBody")}
          </p>
        </div>
        <footer className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <PublicCmsFooterNav locale={locale} />
          </div>
        </footer>
      </>
    );
  }

  const publicSettings = await getPublicSettings();
  if (!publicSettings.directoryPublic) {
    return (
      <>
        <PublicHeader />
        <div className="mx-auto max-w-lg flex-1 px-4 py-20 text-center">
          <h1 className="text-xl font-semibold">{t("public.directory.pausedTitle")}</h1>
          <p className="mt-3 text-m text-[var(--impronta-muted)]">
            {t("public.directory.pausedBody")}
          </p>
        </div>
        <footer className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <PublicCmsFooterNav locale={locale} />
          </div>
        </footer>
      </>
    );
  }

  const initialSavedIds = await getSavedTalentIds();
  const actor = await getCachedActorSession();
  const aiFlags = await getAiFeatureFlags();

  return (
    <>
      <PublicHeader />
      <DirectoryAnalyticsMount locale={locale} />
      <DiscoveryStateBridge savedIds={initialSavedIds} />
      {actor.user ? <MergeGuestFavorites /> : null}
      <Suspense fallback={null}>
        <DirectoryInquiryUrlSync />
      </Suspense>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <header className="mx-auto mb-6 max-w-2xl space-y-3 text-center sm:mb-8 sm:space-y-4">
          <h1 className="font-display text-2xl font-medium tracking-wide text-foreground sm:text-3xl">
            {t("public.directory.pageTitle")}
          </h1>
          <p className="text-m leading-relaxed text-[var(--impronta-muted)]">
            {t("public.directory.pageDescription")}
          </p>
          <div className="pt-1">
            {/* HeroSearch uses useSearchParams — needs Suspense (Next.js CSR bailout). */}
            <Suspense
              fallback={
                <div className="mx-auto w-full max-w-2xl">
                  <div className="relative h-14 rounded-xl border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 sm:h-16" />
                </div>
              }
            >
              <HeroSearch
                copy={heroSearchCopy}
                directoryUrlSync
                initialDirectoryQuery={parseDirectoryQuery(sp.q)}
                aiSearchEnabled={aiFlags.ai_master_enabled && aiFlags.ai_search_enabled}
                locale={locale === "es" ? "es" : "en"}
              />
            </Suspense>
          </div>
        </header>

        <Suspense
          fallback={
            <div className="flex gap-8">
              <div className="hidden w-56 shrink-0 md:block">
                <DirectoryFiltersSkeleton />
              </div>
              <div className="flex-1">
                <DirectoryGridSkeleton />
              </div>
            </div>
          }
        >
          <DirectoryDiscoverSection
            searchParams={sp}
            initialSavedIds={initialSavedIds}
          />
        </Suspense>
      </div>
      <footer className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <PublicCmsFooterNav locale={locale} />
        </div>
      </footer>
    </>
  );
}
