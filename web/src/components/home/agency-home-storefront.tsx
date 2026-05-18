import { PublicHeader } from "@/components/public-header";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import { PoweredByTulala } from "@/components/powered-by-tulala";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { PublicFlashHost } from "@/components/directory/public-flash-host";
import type { Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import {
  isPreviewActiveForTenant,
  loadHomepageForRender,
} from "@/lib/site-admin/server/homepage-reads";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { isLocale } from "@/lib/site-admin/locales";
import { homepageMeta } from "@/lib/site-admin/templates/homepage/meta";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { EmptyCanvasStarter } from "@/components/edit-chrome/empty-canvas-starter";
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
 * The CMS / Page Builder composition is now the canonical and only body
 * render path. A tenant without a published composition gets the starter
 * picker (in edit mode) or a neutral no-composition state (public) — never
 * one tenant's marketing content. The modern-shell-vs-legacy-shell guard
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
  ]);
  // Suppress the draft banner when the in-place edit chrome is engaged — the
  // top bar already signals draft state and its "Publish" button replaces the
  // "go to the composer" instruction. Showing both is contradictory.
  const showPreviewBanner = previewActive && !editActive;
  const brandLabel = identity?.public_name?.trim() || PLATFORM_BRAND.name;
  const footerTagline =
    identity?.footer_tagline?.trim() || t("public.home.footer.tagline");
  const cmsSlots = cmsHomepage?.snapshot?.slots ?? [];
  const cmsHeroSlot = cmsSlots.some((s) => s.slotKey === "hero");
  /** Draft/edit canvases use whatever slot keys the builder assigned — never infer emptiness from a legacy whitelist. */
  const cmsSectionCount = cmsSlots.length;
  /** Non-hero slots render below the full-bleed hero in snapshot order. */
  const hasRenderableNonHeroSlots = cmsSlots.some((s) => s.slotKey !== "hero");

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
         *  otherwise legacy PublicHeader. Never both. Kept in Phase 5. */}
        {snapshotShellActive && cmsLocale ? (
          <PublishedShellHeader tenantId={tenantId} locale={cmsLocale} />
        ) : (
          <PublicHeader />
        )}
        <main className="flex flex-1 flex-col">
          {editActive && cmsSectionCount === 0 ? (
            // Edit mode, no composition yet → starter picker. Dispatches the
            // same `applyStarterComposition` the admin composer uses, so the
            // two paths converge on one seeded-draft state.
            <EmptyCanvasStarter locale={locale} />
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
                        />
                      );
                    })
                : null}
            </>
          ) : (
            // No published composition (public visitor). Neutral, brand-safe
            // placeholder — deliberately minimal. No legacy hardcoded body,
            // no one-tenant marketing content. Admins are guided to a
            // starter via EmptyCanvasStarter in edit mode (above).
            <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {t("public.home.noComposition")}
              </p>
            </section>
          )}

          {snapshotShellActive && cmsLocale ? (
            <PublishedShellFooter tenantId={tenantId} locale={cmsLocale} />
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
      </PublicDiscoveryStateProvider>
    </div>
  );
}
