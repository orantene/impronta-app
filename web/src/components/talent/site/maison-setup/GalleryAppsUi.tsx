"use client";

/**
 * Market apps in the talent theme gallery: the corner badge (theme + demo
 * cards) and the Apps tab with a live playground + Wave 4 browse/add paths.
 */
import { useId, type ReactNode } from "react";
import Link from "next/link";
import type { AppLibraryEntry } from "@/lib/site-admin/add-gallery/apps-registry";
import { NailStudioFrame } from "@/lib/site-admin/builder-node/nail-designer-frame";
import type { MaisonSetupLocale } from "./maison-setup-copy";
import { appBadgeLabel, appBadgeTip, appName, appPitch, galleryAppsT } from "./gallery-apps";

export function AppBadge({
  apps,
  locale,
  onOpen,
  testId,
  className = "",
}: {
  apps: ReadonlyArray<AppLibraryEntry>;
  locale: MaisonSetupLocale;
  onOpen: () => void;
  testId?: string;
  className?: string;
}) {
  const tipId = useId();
  const label = appBadgeLabel(apps, locale);
  if (!label) return null;
  return (
    <span className={`group relative z-10 inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        data-testid={testId ?? "gallery-app-badge"}
        data-gallery-app-badge=""
        aria-describedby={tipId}
        onClick={onOpen}
        className="inline-flex items-center whitespace-nowrap rounded-full bg-admin-highlight px-2.5 py-1 text-[11.5px] font-bold text-admin-highlight-ink shadow-sm"
      >
        {label}
      </button>
      <span
        id={tipId}
        role="tooltip"
        data-testid="gallery-app-badge-tip"
        className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 hidden w-max max-w-[220px] rounded-lg bg-admin-ink px-2.5 py-1.5 text-[12px] font-medium leading-snug text-white shadow-lg group-focus-within:block group-hover:block"
      >
        {appBadgeTip(apps, locale)}
      </span>
    </span>
  );
}

type PreviewDevice = "phone" | "desktop";

const PLAYGROUND: Record<
  string,
  (locale: MaisonSetupLocale, device: PreviewDevice) => ReactNode
> = {
  app_nail_designer: (locale, device) => (
    <section className="sb-nd" data-nd-layout={device}>
      <NailStudioFrame locale={locale} layout={device} />
    </section>
  ),
};

export function AppsTab({
  apps,
  locale,
  previewDevice = "desktop",
  onBrowseAll,
  onOpenApp,
}: {
  apps: ReadonlyArray<AppLibraryEntry>;
  locale: MaisonSetupLocale;
  previewDevice?: PreviewDevice;
  /** Wave 4: open the Apps library (Sugeridas + Todas). */
  onBrowseAll?: () => void;
  /** Wave 4: open one app's detail page. */
  onOpenApp?: (appId: string) => void;
}) {
  return (
    <div data-testid="gallery-apps-tab" data-gallery-wave4-apps-tab="" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {onBrowseAll ? (
          <button
            type="button"
            data-testid="gallery-apps-browse-all"
            onClick={onBrowseAll}
            className="min-h-11 rounded-xl border border-admin-border-soft bg-admin-surface-alt px-4 text-[13px] font-semibold text-admin-ink"
          >
            {galleryAppsT(locale, "browseAll")}
          </button>
        ) : null}
        <Link
          href="/talent/page-builder"
          data-testid="gallery-apps-open-builder"
          className="min-h-11 rounded-xl px-3 text-[13px] font-semibold text-admin-ink underline-offset-2 hover:underline"
        >
          {galleryAppsT(locale, "builderLink")}
        </Link>
      </div>

      {apps.length === 0 ? (
        <p data-testid="gallery-apps-empty" className="p-4 text-[13px] text-admin-ink-dim">
          {galleryAppsT(locale, "empty")}
        </p>
      ) : (
        apps.map((app) => {
          const play = PLAYGROUND[app.nativeKind];
          return (
            <article
              key={app.nativeKind}
              data-testid={`gallery-app-${app.nativeKind}`}
              className="overflow-hidden rounded-xl border border-admin-border-soft bg-white"
            >
              <header className="flex flex-col gap-1 px-4 pb-2 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-admin-ink">{appName(app, locale)}</h3>
                  {app.premium ? (
                    <span
                      data-testid="gallery-app-pro"
                      className="rounded-full bg-admin-ink px-2 py-0.5 text-[10.5px] font-bold text-white"
                    >
                      {galleryAppsT(locale, "pro")}
                    </span>
                  ) : null}
                  {onOpenApp ? (
                    <button
                      type="button"
                      data-testid={`gallery-app-open-${app.id}`}
                      onClick={() => onOpenApp(app.id)}
                      className="ml-auto min-h-11 text-[13px] font-semibold text-admin-ink underline-offset-2 hover:underline"
                    >
                      {galleryAppsT(locale, "openApp")}
                    </button>
                  ) : null}
                </div>
                <p className="text-[13px] leading-snug text-admin-ink-muted">{appPitch(app, locale)}</p>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim">
                  {galleryAppsT(locale, "play")}
                </p>
              </header>
              <div
                data-testid={`gallery-app-playground-${app.nativeKind}`}
                data-gallery-app-device={previewDevice}
                className={
                  previewDevice === "phone"
                    ? "mx-auto w-full max-w-[375px] overflow-x-auto px-2 pb-3"
                    : "overflow-x-auto px-2 pb-3"
                }
              >
                {play ? play(locale, previewDevice) : null}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
