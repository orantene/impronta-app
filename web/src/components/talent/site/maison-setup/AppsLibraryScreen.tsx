"use client";

/**
 * Wave 4 Apps library: "Sugeridas para tu oficio" then "Todas las apps".
 * Entry from Mi presencia Apps tile, theme detail browse-all, builder link.
 */
import { useAdminShellOptional } from "@/components/admin/shell/internal/state";
import type { AppLibraryEntry } from "@/lib/site-admin/add-gallery/apps-registry";
import {
  allLibraryApps,
  appTradeLabels,
  suggestedAppsForTrade,
} from "./gallery-apps-flow";
import { appName, appPitch, galleryAppsT } from "./gallery-apps";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

function AppCard({
  app,
  locale,
  onOpen,
}: {
  app: AppLibraryEntry;
  locale: MaisonSetupLocale;
  onOpen: () => void;
}) {
  const trades = appTradeLabels(app, locale).slice(0, 3).join(" · ");
  return (
    <button
      type="button"
      data-testid={`apps-library-card-${app.id}`}
      onClick={onOpen}
      className="flex min-h-[120px] flex-col gap-1.5 rounded-2xl border border-admin-border-soft bg-white p-4 text-left transition-colors hover:border-admin-ink/40"
    >
      <span className="text-[20px]" aria-hidden>
        🧩
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[16px] font-semibold text-admin-ink">{appName(app, locale)}</span>
        {app.premium ? (
          <span
            data-testid="gallery-app-pro"
            className="rounded-full bg-admin-ink px-2 py-0.5 text-[10.5px] font-bold text-white"
          >
            {galleryAppsT(locale, "pro")}
          </span>
        ) : null}
      </div>
      <span className="line-clamp-2 text-[13px] leading-snug text-admin-ink-muted">
        {appPitch(app, locale)}
      </span>
      {trades ? (
        <span className="mt-auto text-[11.5px] font-medium text-admin-ink-dim">{trades}</span>
      ) : null}
    </button>
  );
}

export function AppsLibraryScreen({
  locale,
  onOpenApp,
  onBack,
  onClose,
}: {
  locale: MaisonSetupLocale;
  onOpenApp: (appId: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const tradeLabel = useAdminShellOptional()?.bridgeTalentSelfProfile?.primaryTypeLabel ?? null;
  const suggested = suggestedAppsForTrade(tradeLabel);
  const all = allLibraryApps();

  return (
    <section
      data-testid="apps-library-screen"
      data-gallery-wave4-apps-library=""
      className="mx-auto w-full max-w-[960px] px-4 pb-10 pt-2 font-admin-body"
    >
      <header className="mb-5">
        <div className="flex min-h-12 items-center gap-2 border-b border-admin-border-soft pb-3">
          <button
            type="button"
            onClick={onBack}
            data-testid="apps-library-back"
            className="min-h-11 shrink-0 text-[13.5px] font-semibold text-admin-ink"
          >
            ‹ {maisonSetupT(locale, "Today")}
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="text-[15px] font-semibold text-admin-ink">
              {galleryAppsT(locale, "libraryTitle")}
            </h1>
            <p className="text-[11.5px] text-admin-ink-dim">{galleryAppsT(locale, "librarySub")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="apps-library-close"
            aria-label={maisonSetupT(locale, "Close")}
            className="grid h-11 w-11 shrink-0 place-items-center text-[18px] text-admin-ink"
          >
            ✕
          </button>
        </div>
      </header>

      <section className="mb-8" data-testid="apps-library-suggested">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-admin-ink-dim">
          {galleryAppsT(locale, "suggested")}
        </h2>
        {suggested.length === 0 ? (
          <p className="text-[13px] text-admin-ink-muted">{galleryAppsT(locale, "noSuggested")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {suggested.map((app) => (
              <AppCard key={app.id} app={app} locale={locale} onOpen={() => onOpenApp(app.id)} />
            ))}
          </div>
        )}
      </section>

      <section data-testid="apps-library-all">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-admin-ink-dim">
          {galleryAppsT(locale, "allApps")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {all.map((app) => (
            <AppCard key={app.id} app={app} locale={locale} onOpen={() => onOpenApp(app.id)} />
          ))}
        </div>
      </section>
    </section>
  );
}
