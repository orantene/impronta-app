import { Suspense } from "react";
import type { Metadata } from "next";

import { MergeGuestFavorites } from "@/app/(dashboard)/client/merge-guest";
import { DirectoryDiscoverSection } from "@/components/directory/directory-discover-section";
import { DirectoryInquiryUrlSync } from "@/components/directory/directory-inquiry-url-sync";
import { HeroSearch } from "@/components/home/hero-search";
import { DiscoveryStateBridge } from "@/components/directory/public-discovery-state";
import {
  DirectoryFiltersSkeleton,
  DirectoryGridSkeleton,
} from "@/components/directory/directory-skeleton";
import { PublicHeader } from "@/components/public-header";
import { getPublicSettings } from "@/lib/public-settings";
import { getSavedTalentIds } from "@/lib/public-discovery";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, getMessageStringArray } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";
import { parseDirectoryQuery } from "@/lib/directory/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  return {
    title: t("public.meta.directoryTitle"),
    description: t("public.meta.directoryDescription"),
    ...buildPublicLocaleAlternates(locale, "/directory"),
  };
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
    searchSubmit: t("public.home.hero.searchSubmit"),
    typedExamples: getMessageStringArray(locale, "public.home.hero.typedExamples"),
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
      </>
    );
  }

  const initialSavedIds = await getSavedTalentIds();
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  return (
    <>
      <PublicHeader />
      <DiscoveryStateBridge savedIds={initialSavedIds} />
      {user ? <MergeGuestFavorites /> : null}
      <Suspense fallback={null}>
        <DirectoryInquiryUrlSync />
      </Suspense>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 max-w-2xl space-y-3 sm:mb-8 sm:space-y-4">
          <h1 className="font-display text-2xl font-medium tracking-wide text-foreground sm:text-3xl">
            {t("public.directory.pageTitle")}
          </h1>
          <p className="text-m leading-relaxed text-[var(--impronta-muted)]">
            {t("public.directory.pageDescription")}
          </p>
          <div className="pt-1">
            <HeroSearch
              copy={heroSearchCopy}
              directoryUrlSync
              initialDirectoryQuery={parseDirectoryQuery(sp.q)}
            />
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
    </>
  );
}
