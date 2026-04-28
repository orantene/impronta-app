import { PublicHeader } from "@/components/public-header";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { PoweredByTulala } from "@/components/powered-by-tulala";
import { HeroSearch } from "@/components/home/hero-search";
import { LifestyleBackdrop } from "@/components/home/lifestyle-backdrop";
import { TalentTypeShortcuts } from "@/components/home/talent-type-shortcuts";
import { FeaturedTalentSection } from "@/components/home/featured-talent-section";
import { BestForSection } from "@/components/home/best-for-section";
import { LocationSection } from "@/components/home/location-section";
import { HowItWorks } from "@/components/home/how-it-works";
import { CtaSection } from "@/components/home/cta-section";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { resolveStorefrontLifestyleSlides } from "@/lib/site-admin/storefront-lifestyle";
import { getHomepageData } from "@/lib/home-data";
import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
// Phase 0 sweep (2026-04-26) — convergence-plan §1: SiteDarkModeSwitcher and
// FocusOrderOverlay were mounted on the public storefront in M15 but lacked a
// real product story. Files preserved at
// `components/site-chrome/{SiteDarkModeSwitcher,FocusOrderOverlay}.tsx`; will
// be re-mounted (if at all) inside the EditShell via a future Tools panel.
import type { Locale } from "@/i18n/config";
import { createTranslator, getMessageStringArray } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicSettings } from "@/lib/public-settings";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { readGoogleMapsBrowserKey } from "@/lib/env/google-maps-browser-key";
import {
  isPreviewActiveForTenant,
  loadHomepageForRender,
} from "@/lib/site-admin/server/homepage-reads";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { isLocale } from "@/lib/site-admin/locales";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { EmptyCanvasStarter } from "@/components/edit-chrome/empty-canvas-starter";
// Phase B.2.A — snapshot site shell wrappers. Two server components that
// return the snapshot-rendered header + footer slots when the feature
// flag is on for this tenant AND a published shell exists; otherwise
// null so the legacy PublicHeader / footer mount via the mutex below.
// Both ends consult `shouldRenderSnapshotShell` so double-headers are
// impossible.
import {
  PublishedShellHeader,
  PublishedShellFooter,
  shouldRenderSnapshotShell,
} from "@/components/site-shell/PublishedShell";

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
  // Phase 5 / M5: CMS-composed homepage snapshot. When published, its
  // `hero` slot (if present) replaces the template hero copy below.
  // Platform locales are a subset of request locales; fall through silently
  // when the request locale isn't a platform locale.
  const cmsLocale = isLocale(locale) ? locale : null;

  const [
    { talentTypes, featuredTalent, fitLabels, locations },
    cmsHomepage,
    identity,
    previewActive,
    editActive,
    snapshotShellActive,
  ] = await Promise.all([
    getHomepageData({ tenantId }),
    cmsLocale
      ? loadHomepageForRender(tenantId, cmsLocale)
      : Promise.resolve(null),
    loadPublicIdentity(tenantId),
    isPreviewActiveForTenant(tenantId),
    isEditModeActiveForTenant(tenantId),
    // Phase B.2.A — single source of truth for "does this tenant render the
    // snapshot shell instead of the legacy PublicHeader/footer?" Closed
    // unless: feature flag covers this tenant AND a published shell row
    // exists. Mutex below uses this both above and below the body.
    cmsLocale
      ? shouldRenderSnapshotShell(tenantId, cmsLocale)
      : Promise.resolve(false),
  ]);
  // Suppress the draft banner when the in-place edit chrome is engaged — the
  // top bar already signals draft state and its "Publish" button replaces the
  // "go to the composer" instruction. Showing both is contradictory.
  const showPreviewBanner = previewActive && !editActive;
  const brandLabel = identity?.public_name?.trim() || PLATFORM_BRAND.name;
  const footerTagline =
    identity?.footer_tagline?.trim() || t("public.home.footer.tagline");
  const cmsHeroSlot = cmsHomepage?.snapshot?.slots.some(
    (s) => s.slotKey === "hero",
  );
  /**
   * M7.1 — when the operator has composed additional homepage slots beyond
   * the hero (trust_band, services, featured, process, destinations,
   * gallery, testimonials, final_cta), render those instead of the legacy
   * hardcoded stack. A snapshot with ONLY `hero` keeps the existing
   * hardcoded fallback sections so legacy tenants continue to work.
   */
  const cmsComposedSlotKeys = new Set(
    (cmsHomepage?.snapshot?.slots ?? []).map((s) => s.slotKey),
  );
  const hasCmsComposition = (
    [
      "trust_band",
      "services",
      "featured",
      "process",
      "destinations",
      "gallery",
      "testimonials",
      "final_cta",
      "primary",
      "secondary",
      "footer-callout",
    ] as const
  ).some((slotKey) => cmsComposedSlotKeys.has(slotKey));
  const cmsIntroTagline = cmsHomepage?.snapshot?.fields.introTagline ?? null;
  /**
   * Hero kicker precedence (tenant-safe):
   * 1. CMS field `introTagline` (operator-curated on homepage).
   * 2. Identity `tagline` (operator-curated on /admin/site-settings/identity).
   * 3. i18n fallback (platform-neutral copy).
   * Falling straight to the i18n string leaked Impronta-specific copy
   * ("Models & image agency") to every storefront that hadn't overridden it.
   */
  const heroKicker =
    cmsIntroTagline ??
    identity?.tagline?.trim() ??
    t("public.home.hero.kicker");
  /** Curated lifestyle reel for the fallback hero (Nova et al.). */
  const lifestyleSlides = cmsHeroSlot
    ? null
    : resolveStorefrontLifestyleSlides(tenantId);

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
    <div
      className="flex min-h-full flex-1 flex-col bg-background"
      data-preview={previewActive ? "draft" : undefined}
    >
      {showPreviewBanner ? (
        <div
          role="status"
          aria-label="Preview mode — showing draft"
          className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-amber-400/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-950 shadow-sm"
        >
          <span className="size-1.5 rounded-full bg-zinc-950" aria-hidden />
          Preview — showing draft. Publish from the composer to go live.
        </div>
      ) : null}
      <PublicDiscoveryStateProvider>
        <PublicFlashHost dismissAria={t("public.directory.ui.flash.dismissAria")} />
        {/* Phase B.2.A mutex — snapshot shell wins when its gates open;
         *  otherwise legacy PublicHeader. Never both. */}
        {snapshotShellActive && cmsLocale ? (
          <PublishedShellHeader tenantId={tenantId} locale={cmsLocale} />
        ) : (
          <PublicHeader />
        )}
        <main className="flex flex-1 flex-col">
          {/* Edit-mode empty-canvas short-circuit.
           *
           * When the operator has engaged edit mode but the homepage has no
           * CMS sections composed (no hero slot, no other slots), render the
           * starter picker in place of the legacy hero + fallback stack.
           * Without this, the chrome mounts but the canvas looks like the
           * hardcoded Impronta layout with no way to select or edit anything
           * — the operator is stranded. The picker dispatches the same
           * `applyStarterComposition` the admin composer uses, so the two
           * paths converge on the same seeded-draft state. */}
          {editActive && !cmsHeroSlot && !hasCmsComposition ? (
            <EmptyCanvasStarter />
          ) : (
            <>
          {cmsHeroSlot && cmsHomepage?.snapshot ? (
            // CMS-composed hero — rendered full-bleed at the top level of
            // <main>, bypassing the legacy max-w-3xl centered wrapper that
            // was designed for text-only heroes. The HeroComponent's
            // background imagery and full-viewport height need edge-to-edge
            // layout to work correctly.
            //
            // HeroSearch is intentionally omitted in this path: editorial CMS
            // heroes carry their own CTAs; the utility search bar would
            // visually break the full-bleed design and is unnecessary when
            // explicit "Browse Talent" / "Get in Touch" CTAs are present.
            <HomepageCmsSections
              snapshot={cmsHomepage.snapshot}
              tenantId={tenantId}
              locale={locale}
              onlySlot="hero"
            />
          ) : (
          <section
            className={
              lifestyleSlides
                ? "site-hero relative flex flex-col items-center justify-center overflow-hidden"
                : "relative flex flex-col items-center justify-center px-4 pb-6 pt-16 sm:px-6 sm:pb-12 sm:pt-28 lg:px-8"
            }
            data-hero-mood={lifestyleSlides ? "cinematic" : undefined}
            data-hero-overlay={lifestyleSlides ? "gradient-scrim" : undefined}
            data-hero-variant={lifestyleSlides ? "slider" : undefined}
          >
            {lifestyleSlides ? (
              <LifestyleBackdrop
                slides={[...lifestyleSlides]}
                perSlideMs={7000}
                overlay="gradient-scrim"
              />
            ) : (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(212,175,55,0.12),transparent)]"
              />
            )}
            <div
              className={
                lifestyleSlides
                  ? "site-hero__inner relative w-full max-w-3xl text-center"
                  : "relative w-full max-w-3xl text-center"
              }
            >
              <p className="font-display text-sm font-medium uppercase tracking-[0.35em] text-[var(--impronta-gold-dim)]">
                {heroKicker}
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
                <HeroSearch
                  copy={heroSearchCopy}
                  aiSearchEnabled={aiHeroSearchEnabled}
                  locale={locale === "es" ? "es" : "en"}
                />
              </div>
            </div>
          </section>
          )}

          {/* M7.1 — CMS composition vs legacy hardcoded fallback.
           *
           * When the operator has assigned sections to any non-hero slot
           * (trust_band, services, featured, process, destinations, gallery,
           * testimonials, final_cta, …), render those sections in snapshot
           * order. The legacy TalentTypeShortcuts / FeaturedTalentSection /
           * BestFor / Location / HowItWorks / CtaSection stack stays as the
           * fallback for tenants that haven't composed a homepage yet.
           *
           * Rendering skips the `hero` slot because it's already rendered
           * above — the hero lives inside a specific `<section>` that
           * includes the search bar and lifestyle backdrop. */}
          {hasCmsComposition && cmsHomepage?.snapshot ? (
            cmsHomepage.snapshot.slots
              .filter((s) => s.slotKey !== "hero")
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((entry) => {
                const snap = cmsHomepage.snapshot!;
                return (
                  <HomepageCmsSections
                    key={`cms-slot-${entry.slotKey}-${entry.sectionId}-${entry.sortOrder}`}
                    snapshot={{ ...snap, slots: [entry] }}
                    tenantId={tenantId}
                    locale={locale}
                  />
                );
              })
          ) : (
            <>
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

              <BestForSection
                labels={fitLabels}
                locale={locale}
                copy={bestForCopy}
              />

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
            </>
          )}
            </>
          )}

          {snapshotShellActive && cmsLocale ? (
            <PublishedShellFooter tenantId={tenantId} locale={cmsLocale} />
          ) : (
            <footer className="border-t border-border px-4 py-10 sm:px-6 lg:px-8">
              <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center text-sm text-[var(--impronta-muted)]">
                <PublicCmsFooterNav locale={locale} />
                <p className="font-display text-m uppercase tracking-[0.2em] text-foreground">
                  {brandLabel}
                </p>
                <p>{footerTagline}</p>
                <p>
                  {t("public.home.footer.copyright")
                    .replace("{year}", String(year))
                    .replace("{brand}", brandLabel)}
                </p>
                <PoweredByTulala className="mt-2" />
              </div>
            </footer>
          )}
        </main>
      </PublicDiscoveryStateProvider>
    </div>
  );
}
