import { Suspense } from "react";
import type { Metadata } from "next";

import { DirectoryAnalyticsMount } from "@/components/analytics/directory-analytics-mount";
import { DirectoryInquiryUrlSync } from "@/components/directory/directory-inquiry-url-sync";
import { DiscoveryStateBridge } from "@/components/directory/public-discovery-state";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { PublicHeader } from "@/components/public-header";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { getPublicSettings } from "@/lib/public-settings";
import { getSavedTalentIds } from "@/lib/public-discovery";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { loadPageForRender } from "@/lib/site-admin/server/page-reads";
import { readTenantPageRoles } from "@/lib/site-admin/server/page-roles";
import { resolveRoleSlug } from "@/lib/site-admin/server/page-roles-shape";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import type { Locale } from "@/i18n/config";
import { buildPublicPageMetadata } from "@/lib/seo/public-metadata";
import { AgencyChatLauncherMount } from "@/app/(public)/_chat/AgencyChatLauncherMount";
import { DirectoryComponent } from "@/lib/site-admin/sections/directory/Component";
import { fashionDirectoryPreset } from "@/lib/site-admin/sections/directory/presets";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return buildPublicPageMetadata("directory", locale);
}

/**
 * The directory route — Phase 3 Step 2: zero-regression guarded adapter.
 *
 * The directory is a portable page-builder section, NOT a hardcoded
 * monolith. This route is a thin alias (R1: `/directory` is an
 * allow-listed storefront prefix so the CMS clean-URL rewrite never
 * fires — the route file must self-resolve). It resolves the seeded
 * system page at the fenced slug `__directory__` through the generic
 * builder renderer; if that row is absent (no tenant seeded yet) it
 * falls back to the exact direct `DirectoryComponent` render — so
 * behavior is identical until Phase 3 Step 1 (the `ensureDirectoryPage`
 * seed) lands. The six route-bolted behaviors (gate, metadata,
 * analytics, discovery bridge, guest-merge, inquiry-url-sync) stay here
 * wrapping whichever body resolves.
 */
export default async function DirectoryPage() {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

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

  // Phase 3 Step 2 — try the seeded `__directory__` builder page; fall
  // back to the direct component when absent (zero-regression until the
  // seed lands).
  const publicScope = await getPublicTenantScope();
  const tenantId = publicScope?.tenantId ?? "";
  // PAGE ROLES — `/directory` serves whichever page the tenant assigned the
  // `directory` role; unset falls back to the seeded `__directory__` page (and
  // then to the built-in component below), so zero-config tenants are unchanged.
  const roleClient = tenantId ? createPublicSupabaseClient() : null;
  const directorySlug = roleClient
    ? resolveRoleSlug(await readTenantPageRoles(roleClient, tenantId), "directory", "__directory__")
    : "__directory__";
  const directorySectionPage = roleClient
    ? await loadPageForRender(tenantId, locale as Locale, directorySlug)
    : null;

  return (
    <>
      <PublicHeader />
      <DirectoryAnalyticsMount locale={locale} />
      <DiscoveryStateBridge savedIds={initialSavedIds} />
      <Suspense fallback={null}>
        <DirectoryInquiryUrlSync />
      </Suspense>
      {directorySectionPage?.snapshot ? (
        <main className="flex-1">
          <HomepageCmsSections
            snapshot={directorySectionPage.snapshot}
            tenantId={tenantId}
            locale={locale}
          />
        </main>
      ) : (
        <div className="flex-1">
          <DirectoryComponent
            props={fashionDirectoryPreset}
            tenantId={tenantId}
            locale={locale}
            preview={false}
          />
        </div>
      )}
      <footer className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <PublicCmsFooterNav locale={locale} />
        </div>
      </footer>
      {/* Floating "Message {agency}" guest-chat launcher — self-gates on the
          tenant's guest-chat settings (enabled + show-on-directory). */}
      <AgencyChatLauncherMount sourcePage="/directory" />
    </>
  );
}
