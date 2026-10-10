"use client";

/**
 * Live-site fallback when Maison setup is cohort-off for this talent.
 * Change design / Apps tiles on MyWebsiteCard must not no-op: open the
 * theme gallery or Apps library inside the same overlay chrome as Maison
 * setup (backdrop, portal, focus trap, Escape). Apps → design keeps the
 * overlay open and switches to the design gallery (Maison's back-stack).
 * TUL-325: gallery applySuccess still wires Publish CTA via onPublish.
 */
import { useState, useTransition } from "react";

import { AppsLibraryScreen } from "@/components/talent/site/maison-setup/AppsLibraryScreen";
import { AppDetailScreen } from "@/components/talent/site/maison-setup/AppDetailScreen";
import { MaisonSetupOverlay } from "@/components/talent/site/maison-setup/MaisonSetupOverlay";
import type { MaisonPreviewDevice } from "@/components/talent/site/maison-setup/maison-choices";
import { maisonSetupT, type MaisonSetupLocale } from "@/components/talent/site/maison-setup/maison-setup-copy";
import { ManagerThemeGallery } from "@/components/talent/site/theme-gallery/ManagerThemeGallery";
import type { ThemeGalleryLocale } from "@/components/talent/site/theme-gallery/theme-gallery-i18n";
import { isThemeApplyBusy } from "@/lib/talent-site/history/apply-busy";
import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";

export type PresenceLiveFallbackScreen = "gallery" | "apps";

type FallbackView =
  | { kind: "gallery" }
  | { kind: "apps" }
  | { kind: "app"; appId: string };

export function PresenceLiveFallback({
  screen,
  locale,
  onClose,
  onApplied,
}: {
  screen: PresenceLiveFallbackScreen;
  locale: ThemeGalleryLocale;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const maisonLocale: MaisonSetupLocale = locale === "es" ? "es" : "en";
  const [view, setView] = useState<FallbackView>(() =>
    screen === "gallery" ? { kind: "gallery" } : { kind: "apps" },
  );
  const [previewDevice, setPreviewDevice] = useState<MaisonPreviewDevice>("phone");
  const [publishPending, startPublish] = useTransition();

  function handlePublish() {
    if (isThemeApplyBusy()) return;
    startPublish(async () => {
      const res = await publishMaxSiteAction();
      if (!res.ok) return;
      await onApplied();
    });
  }

  const overlayLabel =
    view.kind === "gallery"
      ? maisonSetupT(maisonLocale, "Choose a design")
      : maisonSetupT(maisonLocale, "Apps");

  const fallbackScreenAttr = view.kind === "app" ? "apps" : view.kind;

  return (
    <MaisonSetupOverlay label={overlayLabel} onClose={onClose}>
      <div
        data-testid="presence-live-fallback"
        data-fallback-screen={fallbackScreenAttr}
        data-fallback-view={view.kind}
        className="min-h-full"
      >
        {view.kind === "gallery" ? (
          <section
            data-testid="presence-live-fallback-gallery"
            className="mx-auto w-full max-w-[1320px] px-4 pb-10 pt-2 font-admin-body"
          >
            <header className="mb-5">
              <div className="flex min-h-12 items-center gap-2 border-b border-admin-border-soft pb-3">
                <button
                  type="button"
                  onClick={onClose}
                  data-testid="presence-live-fallback-back"
                  className="min-h-11 shrink-0 text-[13.5px] font-semibold text-admin-ink"
                >
                  ‹ {maisonSetupT(maisonLocale, "Today")}
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <h1 className="text-[15px] font-semibold text-admin-ink">
                    {maisonSetupT(maisonLocale, "Choose a design")}
                  </h1>
                  <p className="text-[11.5px] text-admin-ink-dim">
                    {maisonSetupT(maisonLocale, "Your free website")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  data-testid="presence-live-fallback-close"
                  aria-label={maisonSetupT(maisonLocale, "Close")}
                  className="grid h-11 w-11 shrink-0 place-items-center text-[18px] text-admin-ink"
                >
                  ✕
                </button>
              </div>
            </header>
            <ManagerThemeGallery
              locale={locale}
              onApplied={onApplied}
              onPublish={handlePublish}
              publishPending={publishPending}
              wrap={(gallery) => gallery}
              fallback={
                <p className="text-[14px] text-admin-ink-muted">
                  {locale === "es"
                    ? "La galería de diseños no está disponible ahora."
                    : "The design gallery is not available right now."}
                </p>
              }
            />
          </section>
        ) : view.kind === "app" ? (
          <AppDetailScreen
            locale={maisonLocale}
            appId={view.appId}
            previewDevice={previewDevice}
            onDeviceChange={setPreviewDevice}
            onOpenDesign={() => {
              // Maison openDesignWithAppPatch → theme detail; cohort-off has
              // ManagerThemeGallery only, so keep the overlay and open designs.
              setView({ kind: "gallery" });
            }}
            onBackToLibrary={() => setView({ kind: "apps" })}
            onClose={onClose}
          />
        ) : (
          <AppsLibraryScreen
            locale={maisonLocale}
            onOpenApp={(id) => setView({ kind: "app", appId: id })}
            onBack={onClose}
            onClose={onClose}
          />
        )}
      </div>
    </MaisonSetupOverlay>
  );
}
