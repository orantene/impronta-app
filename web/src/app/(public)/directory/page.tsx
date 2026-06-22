import { Suspense } from "react";
import type { Metadata } from "next";

import { DirectoryAnalyticsMount } from "@/components/analytics/directory-analytics-mount";
import { DirectoryInquiryUrlSync } from "@/components/directory/directory-inquiry-url-sync";
import { DiscoveryStateBridge } from "@/components/directory/public-discovery-state";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { getPublicSettings } from "@/lib/public-settings";
import { getSavedTalentIds } from "@/lib/public-discovery";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { loadPageForRender } from "@/lib/site-admin/server/page-reads";
import { resolveDirectorySlug } from "@/lib/site-admin/server/page-roles";
import { isLocale } from "@/lib/site-admin/locales";
import CmsPublicPage from "@/app/(public)/p/[[...slug]]/page";
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
        <PublicFooter className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8" />
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
        <PublicFooter className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8" />
      </>
    );
  }

  const initialSavedIds = await getSavedTalentIds();

  // Phase 3 Step 2 — try the seeded `__directory__` builder page; fall
  // back to the direct component when absent (zero-regression until the
  // seed lands).
  const publicScope = await getPublicTenantScope();
  const tenantId = publicScope?.tenantId ?? "";
  // PAGE ROLES — an ASSIGNED directory page (a real, published page) is served
  // through the full storefront renderer (CmsPublicPage), exactly like the home
  // role. This is required because assigned pages are freeform (cms_pages.blocks)
  // and have no section snapshot — the snapshot-only `loadPageForRender` path
  // below would silently render nothing and fall back to the built-in directory.
  // resolveDirectorySlug guards on published existence, so a dangling pointer
  // degrades to the built-in __directory__ page instead of being trusted blindly.
  const assignedDirectorySlug = tenantId
    ? await resolveDirectorySlug(tenantId, isLocale(locale) ? locale : "en")
    : null;
  if (assignedDirectorySlug) {
    // Render the assigned page through the full storefront renderer, but keep
    // the directory client bridges so a directory/roster section on it still
    // works: DiscoveryStateBridge (saved-talent state) + DirectoryInquiryUrlSync
    // (the post-inquiry confirmation sheet + ?inquiry param strip). CmsPublicPage
    // supplies its own header + page-view analytics, so we don't re-add those.
    return (
      <>
        <DiscoveryStateBridge savedIds={initialSavedIds} />
        <Suspense fallback={null}>
          <DirectoryInquiryUrlSync />
        </Suspense>
        <CmsPublicPage params={Promise.resolve({ slug: [assignedDirectorySlug] })} />
      </>
    );
  }
  // Unset/dangling → the seeded `__directory__` section page, then the built-in
  // component below (zero-config tenants are unchanged).
  const directorySectionPage = tenantId
    ? await loadPageForRender(tenantId, locale as Locale, "__directory__")
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
      <PublicFooter className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8" />
      {/* Floating "Message {agency}" guest-chat launcher — self-gates on the
          tenant's guest-chat settings (enabled + show-on-directory). */}
      <AgencyChatLauncherMount sourcePage="/directory" />
    </>
  );
}
