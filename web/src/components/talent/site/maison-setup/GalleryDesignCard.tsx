"use client";

/**
 * Wave 3 library card: full-height live preview (hover-scroll / swipe),
 * name + one chip line, optional "Suggested for you" ribbon. No tag soup.
 */
import type { GallerySearchResult } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { galleryPreviewLookSlug } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { countUsableDemos } from "@/lib/talent-site/theme-catalog/usable-demos";
import { ThemeGalleryPreviewFrame } from "@/components/talent/site/theme-gallery/ThemeGalleryPreviewFrame";
import type { useThemePreview } from "@/components/talent/site/theme-gallery/useThemePreview";
import { demoProfileMetaFor } from "@/lib/talent-site/demos/demo-profile-meta";
import { AppBadge } from "./GalleryAppsUi";
import { appNames, appsOnDesign } from "./gallery-apps";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Preview = ReturnType<typeof useThemePreview>;

export function GalleryDesignCard({
  result,
  locale,
  preview,
  suggested,
  lastViewed,
  matching,
  onExplore,
  onOpenApps,
}: {
  result: GallerySearchResult;
  locale: MaisonSetupLocale;
  preview: Preview;
  suggested: boolean;
  lastViewed: boolean;
  matching: boolean;
  onExplore: () => void;
  onOpenApps: () => void;
}) {
  const d = result.design;
  const demo = result.featuredDemo;
  const n = matching ? countUsableDemos(result.matchingDemos) : countUsableDemos(d.demos);
  const cardApps = appsOnDesign(d);
  const meta = demo ? demoProfileMetaFor(demo) : null;
  const trade = demo ? (locale === "es" ? demo.name.es : demo.name.en) : null;
  const langs =
    meta?.siteLangs?.length
      ? meta.siteLangs.map((l) => l.toUpperCase()).join("/")
      : null;
  const demosChip =
    n === 1
      ? maisonSetupT(locale, "1 demo")
      : maisonSetupT(locale, "{n} demos").replace("{n}", String(n));
  const appChip = cardApps.length ? `🧩 ${appNames(cardApps, locale)}` : null;
  const chips = [trade, langs, demosChip, appChip].filter(Boolean) as string[];
  const tip = d.description[locale];
  // W5-8 / TUL-519: browse cards promise "with your photos and services" — never
  // pass ?demo= here. The owner's talentProfileId on useThemePreview hydrates
  // her content; Demo mode stays on Theme detail via the content toggle.

  return (
    <article
      key={d.slug}
      data-design-slug={d.slug}
      data-maison-theme-card=""
      data-gallery-wave3-card=""
      data-testid={d.slug === "maison" ? "maison-theme-card" : `design-card-${d.slug}`}
      data-last-viewed={lastViewed ? "" : undefined}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white ${
        lastViewed ? "border-admin-ink ring-2 ring-admin-ink/30" : "border-admin-border-soft"
      }`}
    >
      {suggested ? (
        <span
          data-testid="design-card-suggested-ribbon"
          data-card-label="suggested"
          className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-admin-ink/90 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white"
        >
          {maisonSetupT(locale, "Suggested for you")}
        </span>
      ) : null}

      <button
        type="button"
        onClick={onExplore}
        className="group relative block w-full text-left"
        aria-label={`${maisonSetupT(locale, "Explore")} ${d.name}`}
      >
        <div
          data-gallery-card-preview=""
          className="max-h-[420px] overflow-y-auto overscroll-contain sm:max-h-[480px] [scrollbar-width:thin]"
        >
          <ThemeGalleryPreviewFrame
            preview={preview}
            url={preview.src(d.slug, galleryPreviewLookSlug(d, demo?.defaultPalette))}
            locale={locale}
            title={d.name}
            virtualWidth={1280}
            aspectRatio="3 / 4"
          />
        </div>
      </button>

      <div className="flex flex-col gap-1.5 px-4 pb-4 pt-3">
        <div data-testid="design-card-title-row" className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-[18px] font-semibold text-admin-ink">
            {d.name}
            {tip ? (
              <button
                type="button"
                className="ml-1.5 align-middle text-[13px] font-normal text-admin-ink-dim"
                title={tip}
                aria-label={tip}
              >
                ⓘ
              </button>
            ) : null}
          </h3>
          <AppBadge
            apps={cardApps}
            locale={locale}
            testId={`design-app-badge-${d.slug}`}
            onOpen={onOpenApps}
            className="mt-0.5"
          />
        </div>
        {chips.length ? (
          <p
            data-testid="design-card-chip-line"
            className="truncate text-[13px] text-admin-ink-muted"
            title={chips.join(" · ")}
          >
            {chips.join(" · ")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onExplore}
          data-testid={d.slug === "maison" ? "maison-explore-theme" : `design-explore-${d.slug}`}
          className="mt-1 min-h-11 self-start text-[14px] font-semibold text-admin-ink underline-offset-2 hover:underline"
        >
          {maisonSetupT(locale, "Explore")}
        </button>
      </div>
    </article>
  );
}
