"use client";

/**
 * Wave 4 app page: live try-it, "Se ve mejor en" design thumbnails,
 * "Agregar a mi sitio" / Web Office upgrade path (never a dead lock).
 */
import Link from "next/link";
import { useState } from "react";
import { GALLERY_LOCKED_UPGRADE_HREF, galleryLockedHint } from "@/lib/site-admin/add-gallery/structural-lock";
import { NailStudioFrame } from "@/lib/site-admin/builder-node/nail-designer-frame";
import {
  designsThatSuitApp,
  findLibraryApp,
} from "./gallery-apps-flow";
import { appName, appPitch, galleryAppsT } from "./gallery-apps";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import type { MaisonPreviewDevice } from "./maison-choices";

const PLAYGROUND: Record<
  string,
  (locale: MaisonSetupLocale, device: MaisonPreviewDevice) => React.ReactNode
> = {
  app_nail_designer: (locale, device) => (
    <section className="sb-nd" data-nd-layout={device}>
      <NailStudioFrame locale={locale} layout={device} />
    </section>
  ),
};

export function AppDetailScreen({
  locale,
  appId,
  previewDevice = "desktop",
  onDeviceChange,
  onOpenDesign,
  onBackToLibrary,
  onClose,
}: {
  locale: MaisonSetupLocale;
  appId: string | null | undefined;
  previewDevice?: MaisonPreviewDevice;
  onDeviceChange?: (d: MaisonPreviewDevice) => void;
  onOpenDesign: (designSlug: string) => void;
  onBackToLibrary: () => void;
  onClose: () => void;
}) {
  const app = findLibraryApp(appId);
  const [tipOpen, setTipOpen] = useState(false);
  const designs = app ? designsThatSuitApp(app) : [];
  const play = app ? PLAYGROUND[app.nativeKind] : null;
  const lockedHint = galleryLockedHint(locale);

  if (!app) {
    return (
      <section data-testid="app-detail-missing" className="p-6 font-admin-body">
        <button type="button" onClick={onBackToLibrary} className="min-h-11 font-semibold">
          ‹ {galleryAppsT(locale, "backToApps")}
        </button>
        <p className="mt-4 text-[14px] text-admin-ink-muted">{galleryAppsT(locale, "empty")}</p>
      </section>
    );
  }

  return (
    <section
      data-testid="app-detail-screen"
      data-gallery-wave4-app-detail=""
      data-app-id={app.id}
      className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-4 pb-10 pt-2 font-admin-body"
    >
      <header className="flex min-h-12 items-center gap-2 border-b border-admin-border-soft pb-3">
        <button
          type="button"
          onClick={onBackToLibrary}
          data-testid="app-detail-back"
          className="min-h-11 shrink-0 text-[13.5px] font-semibold text-admin-ink"
        >
          ‹ {galleryAppsT(locale, "backToApps")}
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold text-admin-ink">{appName(app, locale)}</h1>
          <p className="truncate text-[12px] text-admin-ink-muted">{appPitch(app, locale)}</p>
        </div>
        <div className="flex rounded-lg border border-admin-border-soft p-0.5">
          {(["desktop", "phone"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={previewDevice === d}
              data-testid={`app-detail-device-${d}`}
              onClick={() => onDeviceChange?.(d)}
              className={`min-h-11 rounded-md px-3 text-[12.5px] font-semibold ${
                previewDevice === d
                  ? "bg-admin-surface-alt text-admin-ink ring-1 ring-admin-ink"
                  : "text-admin-ink-muted"
              }`}
            >
              {d === "desktop" ? "🖥" : "📱"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={maisonSetupT(locale, "Close")}
          className="grid h-11 w-11 place-items-center text-[18px]"
        >
          ✕
        </button>
      </header>

      <div
        data-testid={`app-detail-playground-${app.nativeKind}`}
        data-gallery-app-device={previewDevice}
        className={
          previewDevice === "phone"
            ? "mx-auto w-full max-w-[375px] overflow-hidden rounded-2xl border border-admin-border-soft bg-white"
            : "overflow-hidden rounded-2xl border border-admin-border-soft bg-white"
        }
      >
        <p className="px-4 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim">
          {galleryAppsT(locale, "play")}
        </p>
        <div className={previewDevice === "phone" ? "px-2 pb-3" : "px-2 pb-3"}>
          {play ? play(locale, previewDevice) : null}
        </div>
      </div>

      {designs.length > 0 ? (
        <section data-testid="app-detail-looks-best">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-admin-ink-dim">
            {galleryAppsT(locale, "looksBest")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {designs.map((d) => (
              <button
                key={d.slug}
                type="button"
                data-testid={`app-detail-design-${d.slug}`}
                onClick={() => onOpenDesign(d.slug)}
                className="flex min-h-[88px] flex-col items-start justify-center gap-1 rounded-2xl border border-admin-border-soft bg-admin-canvas px-4 py-3 text-left hover:border-admin-ink/40"
              >
                <span className="text-[15px] font-semibold text-admin-ink">{d.name}</span>
                <span className="line-clamp-2 text-[12.5px] text-admin-ink-muted">
                  {d.description[locale]}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/talent/page-builder"
          data-testid="app-detail-add-to-site"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-admin-ink px-5 text-[14px] font-semibold text-white"
        >
          {galleryAppsT(locale, "addToSite")}
        </Link>
        <div className="relative flex items-center gap-2">
          <span
            data-testid="app-detail-web-office"
            className="text-[13px] font-semibold text-admin-ink-muted"
          >
            {galleryAppsT(locale, "webOffice")}
          </span>
          <button
            type="button"
            data-testid="app-detail-web-office-tip"
            aria-label={galleryAppsT(locale, "webOfficeTip")}
            onClick={() => setTipOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center text-[14px] text-admin-ink-dim"
          >
            ⓘ
          </button>
          {tipOpen ? (
            <div
              role="tooltip"
              className="absolute left-0 top-full z-20 mt-1 w-max max-w-[260px] rounded-lg bg-admin-ink px-3 py-2 text-[12px] leading-snug text-white shadow-lg"
            >
              {galleryAppsT(locale, "webOfficeTip")}
            </div>
          ) : null}
          <a
            href={GALLERY_LOCKED_UPGRADE_HREF}
            data-testid="app-detail-see-plans"
            className="text-[13px] font-semibold text-admin-ink underline-offset-2 hover:underline"
          >
            {lockedHint.cta}
          </a>
        </div>
      </div>
    </section>
  );
}
