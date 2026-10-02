"use client";

/**
 * Market apps in the talent theme gallery: the corner badge (theme + demo
 * cards) and the Apps tab with a live playground rendering the real island.
 */
import type { ReactNode } from "react";
import type { AppLibraryEntry } from "@/lib/site-admin/add-gallery/apps-registry";
import { NAIL_DESIGNER_CSS } from "@/lib/site-admin/builder-node/nail-designer-css";
import { NailDesignerIsland } from "@/lib/site-admin/builder-node/nail-designer-island";
import type { MaisonSetupLocale } from "./maison-setup-copy";
import { appBadgeLabel, appName, appPitch, galleryAppsT } from "./gallery-apps";

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
  const label = appBadgeLabel(apps, locale);
  if (!label) return null;
  return (
    <button
      type="button"
      data-testid={testId ?? "gallery-app-badge"}
      data-gallery-app-badge=""
      onClick={onOpen}
      className={`z-10 max-w-[70%] truncate rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-admin-ink shadow-sm ${className}`}
    >
      {label}
    </button>
  );
}

const PLAYGROUND: Record<string, (locale: MaisonSetupLocale) => ReactNode> = {
  app_nail_designer: (locale) => (
    <section className="sb-nd">
      <style>{NAIL_DESIGNER_CSS}</style>
      <NailDesignerIsland locale={locale} ctaLabel={locale === "es" ? "Enviar mi diseño" : "Send my design"} />
    </section>
  ),
};

export function AppsTab({ apps, locale }: { apps: ReadonlyArray<AppLibraryEntry>; locale: MaisonSetupLocale }) {
  if (apps.length === 0) {
    return (
      <p data-testid="gallery-apps-empty" className="p-4 text-[13px] text-admin-ink-dim">
        {galleryAppsT(locale, "empty")}
      </p>
    );
  }
  return (
    <div data-testid="gallery-apps-tab" className="flex flex-col gap-5">
      {apps.map((app) => {
        const play = PLAYGROUND[app.kind];
        return (
          <article
            key={app.kind}
            data-testid={`gallery-app-${app.kind}`}
            className="overflow-hidden rounded-xl border border-admin-border-soft bg-white"
          >
            <header className="flex flex-col gap-1 px-4 pb-2 pt-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-semibold text-admin-ink">{appName(app, locale)}</h3>
                {app.premium ? (
                  <span
                    data-testid="gallery-app-pro"
                    className="rounded-full bg-admin-ink px-2 py-0.5 text-[10.5px] font-bold text-white"
                  >
                    {galleryAppsT(locale, "pro")}
                  </span>
                ) : null}
              </div>
              <p className="text-[13px] leading-snug text-admin-ink-muted">{appPitch(app, locale)}</p>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim">
                {galleryAppsT(locale, "play")}
              </p>
            </header>
            <div data-testid={`gallery-app-playground-${app.kind}`} className="overflow-x-auto px-2 pb-3">
              {play ? play(locale) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
