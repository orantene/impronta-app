import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { SitePageViewAnalytics } from "@/components/analytics/site-page-view-analytics";
import { AgencyChatLauncherMount } from "@/app/(public)/_chat/AgencyChatLauncherMount";
import { MergeGuestFavorites } from "@/components/client/merge-guest-favorites";
import { DirectoryInquiryModalProvider } from "@/components/directory/directory-inquiry-modal-context";
import { DirectoryInquirySheet } from "@/components/directory/directory-inquiry-sheet";
import { FavoritesDrawer } from "@/components/directory/favorites-drawer";
import { FavoritesDrawerProvider } from "@/components/directory/favorites-drawer-context";
import {
  DiscoveryStateBridge,
  PublicDiscoveryStateProvider,
} from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { PublicHeader } from "@/components/public-header";
import { PoweredByTulala } from "@/components/powered-by-tulala";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import type { Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { buildDirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import {
  getFavoriteTalentIds,
  getSavedTalentIds,
} from "@/lib/public-discovery";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  isPreviewActiveForTenant,
  loadHomepageForRender,
} from "@/lib/site-admin/server/homepage-reads";
import {
  BuilderNodeRendererStyles,
  collectPresentNodeKinds,
  resolveSnapshotBuilderTree,
} from "@/lib/site-admin/builder-node";
import { treeHasInstances } from "@/lib/site-admin/builder-node/component-instances";
import { jsonLdDocumentToScript } from "@/lib/site-admin/cms-seo";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { loadPublicBranding, loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { isLocale } from "@/lib/site-admin/locales";
import { homepageMeta } from "@/lib/site-admin/templates/homepage/meta";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { EmptyCanvasStarter } from "@/components/edit-chrome/empty-canvas-starter";
import { DefaultStorefrontBody } from "@/components/home/default-storefront-body";
import { resolvePlatformDefaultStorefrontTree } from "@/lib/site-admin/server/default-storefront-template";
import { createServiceRoleClient } from "@/lib/supabase/admin";
// Phase B.2.A — snapshot site shell wrappers. Two server components that
// return the snapshot-rendered header + footer slots when the feature
// flag is on for this tenant AND a published shell exists; otherwise
// null so the legacy PublicHeader / footer mount via the mutex below.
// Both ends consult `shouldRenderSnapshotShell` so double-headers are
// impossible. This shell-fallback guard is intentionally kept (Phase 5
// removed the hardcoded *body* fallback only).
import {
  PublishedShellHeader,
  PublishedShellFooter,
  shouldRenderSnapshotShell,
} from "@/components/site-shell/PublishedShell";

const HOMEPAGE_SLOT_ORDER = new Map(
  homepageMeta.slots.map((slot, index) => [slot.key, index] as const),
);

function compareHomepageSlotEntries(
  a: HomepageSnapshot["slots"][number],
  b: HomepageSnapshot["slots"][number],
): number {
  const aSlot = HOMEPAGE_SLOT_ORDER.get(a.slotKey) ?? Number.MAX_SAFE_INTEGER;
  const bSlot = HOMEPAGE_SLOT_ORDER.get(b.slotKey) ?? Number.MAX_SAFE_INTEGER;
  if (aSlot !== bSlot) return aSlot - bSlot;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/**
 * Agency-surface storefront (what was the old root homepage).
 *
 * Rendered by `app/page.tsx` when `hostContext.kind === "agency"`. The
 * tenant id comes from the host-context header that middleware set after
 * `agency_domains` lookup — never a runtime fallback.
 *
 * Phase 5 (2026-05-18): the deprecated hardcoded Impronta-flavored body
 * fallback (legacy hero + TalentTypeShortcuts / FeaturedTalentSection /
 * BestForSection / LocationSection / HowItWorks / CtaSection) was removed.
 * The CMS / Page Builder composition is the canonical body render path.
 *
 * Integration (2026-05-28, "Phase A"): a tenant without a published
 * composition no longer gets a blank placeholder. Public visitors see a
 * data-driven `DefaultStorefrontBody` — a per-tenant auto-storefront built
 * from THIS tenant's own identity + published roster. This honors the
 * Phase-5 rule (no hardcoded single-tenant marketing; nothing leaks across
 * tenants) while giving a brand-new workspace a branded, populated homepage
 * out of the box. Owners are still guided to a custom composition via
 * `EmptyCanvasStarter` in edit mode. The modern-shell-vs-legacy-shell guard
 * is deliberately preserved.
 */
export async function AgencyHomeStorefront({ tenantId }: { tenantId: string }) {
  const locale: Locale = await getRequestLocale();
  const t = createTranslator(locale);
  // Platform locales are a subset of request locales; fall through silently
  // when the request locale isn't a platform locale.
  const cmsLocale = isLocale(locale) ? locale : null;

  const [
    cmsHomepage,
    identity,
    previewActive,
    editActive,
    snapshotShellActive,
    savedIds,
    favoriteIds,
    actor,
    publicBranding,
  ] = await Promise.all([
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
    getSavedTalentIds(),
    getFavoriteTalentIds(),
    getCachedActorSession(),
    loadPublicBranding(tenantId),
  ]);
  const favoriteIcon = publicBranding?.favorite_icon ?? "bookmark";
  const tenantBrand = identity?.public_name?.trim() ?? null;
  const directoryUi = buildDirectoryUiCopy(t, tenantBrand);
  // Suppress the draft banner when the in-place edit chrome is engaged — the
  // top bar already signals draft state and its "Publish" button replaces the
  // "go to the composer" instruction. Showing both is contradictory.
  const showPreviewBanner = previewActive && !editActive;
  const brandLabel = identity?.public_name?.trim() || PLATFORM_BRAND.name;
  const footerTagline =
    identity?.footer_tagline?.trim() || t("public.home.footer.tagline");
  // Default-storefront CTA — prefer the operator's own configured CTA, then a
  // contact email, then the canonical public browse surface (`/directory` is
  // allow-listed on agency hosts).
  const defaultCtaLabel = identity?.primary_cta_label?.trim() || "Get in touch";
  const contactEmail = identity?.contact_email?.trim();
  const defaultCtaHref =
    identity?.primary_cta_href?.trim() ||
    (contactEmail ? `mailto:${contactEmail}` : "/directory");
  const cmsSlots = cmsHomepage?.snapshot?.slots ?? [];
  const cmsHeroSlot = cmsSlots.some((s) => s.slotKey === "hero");
  /** Draft/edit canvases use whatever slot keys the builder assigned — never infer emptiness from a legacy whitelist. */
  const cmsSectionCount = cmsSlots.length;
  /**
   * Freeform full-page designs (one-click starter designs) persist a
   * `builderTree` with NO curated slots. The slot-count emptiness check below
   * would otherwise treat such a page as empty — showing the first-run picker
   * on top of a page that actually has a design — so detect the tree here.
   */
  const cmsBuilderTreeLen = cmsHomepage?.snapshot?.builderTree?.length ?? 0;
  // ONLY treat the page as freeform when there are NO curated slots — a curated
  // composition keeps its hero-first per-slot render path untouched.
  const hasFreeformBuilderTree =
    cmsBuilderTreeLen > 0 &&
    cmsSectionCount === 0 &&
    Boolean(cmsHomepage?.snapshot);
  /** Non-hero slots render below the full-bleed hero in snapshot order. */
  const hasRenderableNonHeroSlots = cmsSlots.some((s) => s.slotKey !== "hero");
  const shouldRenderBuilderNodeStyles =
    snapshotShellActive ||
    ((cmsSectionCount > 0 || hasFreeformBuilderTree) &&
      Boolean(cmsHomepage?.snapshot));

  // REND-2 — scope this storefront's single shared renderer sheet to the kinds
  // its builder body uses. This top-level sheet ALSO covers the snapshot site
  // shell (header/footer) when it is active, whose trees are not resolved here;
  // so we only scope when the shell is NOT active (legacy PublicHeader is plain
  // React, no builder nodes), on the published path, AND the body tree has no
  // living-component instances (whose master subtree + kinds are loaded deeper,
  // not here). Any of those uncertain → undefined → full sheet (byte-safe).
  const storefrontBodyTree =
    cmsHomepage?.snapshot != null
      ? resolveSnapshotBuilderTree(cmsHomepage.snapshot).tree
      : [];
  const storefrontScopedKinds =
    snapshotShellActive ||
    editActive ||
    previewActive ||
    storefrontBodyTree.length === 0 ||
    treeHasInstances(storefrontBodyTree)
      ? undefined
      : collectPresentNodeKinds(storefrontBodyTree);

  // No-published-composition fallback. The edit-mode empty-canvas starter, the
  // freeform branch, and the curated-slot branch all win first (mirrors the JSX
  // mutex below). When NONE of them render, the public visitor would otherwise
  // see the bland DefaultStorefrontBody — so first try the platform-authored
  // DEFAULT STOREFRONT (a published freeform template under the reserved slug).
  // If it resolves to a non-empty tree we render it through the SAME freeform
  // path the regular builder uses, scoped to THIS tenant (so the connected
  // featured-talent / discipline sections auto-populate from this roster).
  // Absent / empty / any error → defaultStorefrontSnapshot stays null and the
  // JSX falls back to DefaultStorefrontBody exactly as before — so nothing is
  // live until the lead publishes the reserved template.
  const wouldRenderDefaultBranch =
    !(editActive && cmsSectionCount === 0 && !hasFreeformBuilderTree) &&
    !hasFreeformBuilderTree &&
    !(cmsSectionCount > 0 && Boolean(cmsHomepage?.snapshot));
  let defaultStorefrontSnapshot: HomepageSnapshot | null = null;
  if (wouldRenderDefaultBranch) {
    try {
      const serviceSupabase = createServiceRoleClient();
      const resolved = serviceSupabase
        ? await resolvePlatformDefaultStorefrontTree(serviceSupabase)
        : null;
      if (resolved && resolved.builderTree.length > 0) {
        defaultStorefrontSnapshot = {
          version: 1,
          publishedAt: new Date().toISOString(),
          pageVersion: 0,
          locale: cmsLocale ?? locale,
          fields: { title: brandLabel, metaDescription: null, introTagline: null },
          templateSchemaVersion: 1,
          // Freeform full-page design: NO curated slots, tree-only — so it
          // renders through HomepageCmsSections' freeform branch.
          slots: [],
          builderTree: resolved.builderTree,
        };
      }
    } catch {
      // Never throw to the visitor — leave the snapshot null so the JSX falls
      // back to DefaultStorefrontBody (the untouched safety net).
      defaultStorefrontSnapshot = null;
    }
  }
  const shouldRenderDefaultStorefront = defaultStorefrontSnapshot !== null;

  const year = new Date().getFullYear();

  // P4-SEO — operator-authored schema.org JSON-LD, emitted as a structured-data
  // script in the page tree (same pattern as the talent profile page). Suppress
  // in preview/edit so draft structured data is never served to crawlers.
  const jsonLdScript =
    !previewActive && !editActive
      ? jsonLdDocumentToScript(cmsHomepage?.jsonLd ?? null)
      : "";

  return (
    <div
      className="flex min-h-full flex-1 flex-col bg-background"
      data-preview={previewActive ? "draft" : undefined}
      // GAP A — the editor's live-theme projector (ThemePreviewProjector)
      // targets this marker to write draft `--token-*` CSS vars onto the
      // canvas root, so theme edits recolour the canvas instantly without
      // touching the published <html>. Harmless (an unused data-attr) when
      // rendered for an anonymous storefront visitor.
      data-theme-canvas-root=""
    >
      {jsonLdScript ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript }}
        />
      ) : null}
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
      <PublicDiscoveryStateProvider
        initialSavedIds={savedIds}
        initialFavoriteIds={favoriteIds}
      >
        <DiscoveryStateBridge savedIds={savedIds} favoriteIds={favoriteIds} favoriteIcon={favoriteIcon} />
        {actor.user ? <MergeGuestFavorites serverFavoriteIds={favoriteIds} /> : null}
        <DirectoryInquiryModalProvider>
          <FavoritesDrawerProvider>
        <PublicFlashHost dismissAria={t("public.directory.ui.flash.dismissAria")} />
        {shouldRenderBuilderNodeStyles ? (
          <BuilderNodeRendererStyles kinds={storefrontScopedKinds} />
        ) : null}
        {/* A11Y-2 — skip link must be first focusable element before any nav. */}
        <SkipToContent />
        {/* ANALYTICS-2 — first-party page-view for the storefront home (slug "/")
            so storefront feeds the SAME view_site_page stream + admin loader as
            talent-profile/talent-site. Suppressed under edit/preview chrome so
            an operator's own draft views don't pollute the tenant's numbers. */}
        {!editActive && !previewActive ? (
          <SitePageViewAnalytics
            surface="storefront"
            tenantId={tenantId}
            pageSlug="/"
            locale={locale}
          />
        ) : null}
        {/* Phase B.2.A mutex — snapshot shell wins when its gates open;
         *  otherwise legacy PublicHeader. Never both. Kept in Phase 5. */}
        {snapshotShellActive && cmsLocale ? (
          <PublishedShellHeader
            tenantId={tenantId}
            locale={cmsLocale}
            includeBuilderNodeRendererStyles={false}
          />
        ) : (
          <PublicHeader />
        )}
        <main id="main-content" className="flex flex-1 flex-col">
          {editActive && cmsSectionCount === 0 && !hasFreeformBuilderTree ? (
            // Edit mode, no composition yet → starter picker. Dispatches the
            // same `applyStarterComposition` the admin composer uses, so the
            // two paths converge on one seeded-draft state.
            <EmptyCanvasStarter locale={locale} />
          ) : hasFreeformBuilderTree ? (
            // Freeform full-page design: a builderTree with no curated slots
            // (e.g. a one-click starter design). Render the whole snapshot once
            // — HomepageCmsSections resolves + renders the builderTree directly
            // (and stays editable in edit mode). Without this branch a freeform
            // design fell through to the slot-count emptiness check and the
            // first-run picker kept covering it.
            <HomepageCmsSections
              snapshot={cmsHomepage!.snapshot!}
              tenantId={tenantId}
              locale={locale}
              includeBuilderNodeRendererStyles={false}
            />
          ) : cmsSectionCount > 0 && cmsHomepage?.snapshot ? (
            // Canonical (and only) body path: the CMS / Page Builder
            // composition, rendered through the shared renderer. Hero slot
            // is rendered full-bleed first; remaining slots follow in
            // snapshot order.
            <>
              {cmsHeroSlot ? (
                <HomepageCmsSections
                  snapshot={cmsHomepage.snapshot}
                  tenantId={tenantId}
                  locale={locale}
                  onlySlot="hero"
                  includeBuilderNodeRendererStyles={false}
                />
              ) : null}
              {hasRenderableNonHeroSlots
                ? cmsHomepage.snapshot.slots
                    .filter((s) => s.slotKey !== "hero")
                    .sort(compareHomepageSlotEntries)
                    .map((entry) => {
                      const snap = cmsHomepage.snapshot!;
                      return (
                        <HomepageCmsSections
                          key={`cms-slot-${entry.slotKey}-${entry.sectionId}-${entry.sortOrder}`}
                          snapshot={snap}
                          onlySectionId={entry.sectionId}
                          tenantId={tenantId}
                          locale={locale}
                          includeBuilderNodeRendererStyles={false}
                        />
                      );
                    })
                : null}
              <HomepageCmsSections
                snapshot={cmsHomepage.snapshot}
                tenantId={tenantId}
                locale={locale}
                onlyUnboundGallery
                includeBuilderNodeRendererStyles={false}
              />
            </>
          ) : shouldRenderDefaultStorefront ? (
            // No published composition, but a platform DEFAULT STOREFRONT
            // template is published under the reserved slug. Render that
            // premium freeform tree through the SAME path the freeform branch
            // uses, scoped to THIS tenant so the connected featured-talent /
            // discipline sections auto-populate from this tenant's roster.
            // Resolution + degrade-to-null happened above (try/catch); reaching
            // here means defaultStorefrontSnapshot is a non-empty tree.
            <HomepageCmsSections
              snapshot={defaultStorefrontSnapshot!}
              tenantId={tenantId}
              locale={locale}
            />
          ) : (
            // No published composition AND no platform default (public
            // visitor). Render a data-driven *default* storefront built
            // entirely from THIS tenant's own identity + published roster —
            // never hardcoded one-tenant marketing (the Phase-5 concern), and
            // never a blank page. Owners are still guided to a custom
            // composition via EmptyCanvasStarter in edit mode (above); this is
            // what the public sees until then.
            <DefaultStorefrontBody
              tenantId={tenantId}
              brandName={brandLabel}
              tagline={identity?.tagline?.trim() || null}
              primaryColor={publicBranding?.primary_color ?? null}
              ctaLabel={defaultCtaLabel}
              ctaHref={defaultCtaHref}
            />
          )}

          {snapshotShellActive && cmsLocale ? (
            <PublishedShellFooter
              tenantId={tenantId}
              locale={cmsLocale}
              includeBuilderNodeRendererStyles={false}
            />
          ) : (
            <footer className="border-t border-border px-4 py-10 sm:px-6 lg:px-8">
              <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center text-sm text-muted-foreground">
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
            <DirectoryInquirySheet ui={directoryUi} locale={locale} />
            <FavoritesDrawer
              signupHref="/login"
              locale={locale}
              initialFavoriteIdsCount={favoriteIds.length}
            />
          </FavoritesDrawerProvider>
        </DirectoryInquiryModalProvider>
      </PublicDiscoveryStateProvider>
      {/* Floating "Message {agency}" guest-chat launcher — self-gates on the
          tenant's guest-chat settings (enabled + show-on-directory). */}
      <AgencyChatLauncherMount sourcePage="/" />
    </div>
  );
}
