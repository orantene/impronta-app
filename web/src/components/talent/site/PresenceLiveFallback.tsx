"use client";

/**
 * Live-site fallback when Maison setup is cohort-off for this talent.
 * Change design / Apps tiles on MyWebsiteCard must not no-op: open the
 * theme gallery or Apps library instead of MaisonSetupHost.
 */
import { useState } from "react";

import { AppsLibraryScreen } from "@/components/talent/site/maison-setup/AppsLibraryScreen";
import { AppDetailScreen } from "@/components/talent/site/maison-setup/AppDetailScreen";
import type { MaisonSetupLocale } from "@/components/talent/site/maison-setup/maison-setup-copy";
import { ManagerThemeGallery } from "@/components/talent/site/theme-gallery/ManagerThemeGallery";
import type { ThemeGalleryLocale } from "@/components/talent/site/theme-gallery/theme-gallery-i18n";

export type PresenceLiveFallbackScreen = "gallery" | "apps";

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
  const [appId, setAppId] = useState<string | null>(null);

  return (
    <div
      data-testid="presence-live-fallback"
      data-fallback-screen={screen}
      className="fixed inset-0 z-[320] overflow-y-auto bg-[color:var(--admin-canvas,#f6f4f1)]"
      role="dialog"
      aria-modal="true"
    >
      <div className="sticky top-0 z-10 flex items-center justify-end border-b border-admin-border-soft bg-[color:var(--admin-canvas,#f6f4f1)]/95 px-4 py-2 backdrop-blur">
        <button
          type="button"
          data-testid="presence-live-fallback-close"
          onClick={onClose}
          className="min-h-11 px-3 text-[13.5px] font-semibold text-admin-ink"
        >
          {locale === "es" ? "Cerrar" : "Close"}
        </button>
      </div>
      <div className="mx-auto w-full max-w-[1040px] px-4 py-4">
        {screen === "gallery" ? (
          <ManagerThemeGallery
            locale={locale}
            onApplied={onApplied}
            wrap={(gallery) => gallery}
            fallback={
              <p className="text-[14px] text-admin-ink-muted">
                {locale === "es"
                  ? "La galería de diseños no está disponible ahora."
                  : "The design gallery is not available right now."}
              </p>
            }
          />
        ) : appId ? (
          <AppDetailScreen
            locale={maisonLocale}
            appId={appId}
            previewDevice="phone"
            onDeviceChange={() => {}}
            onOpenDesign={() => {
              setAppId(null);
              onClose();
            }}
            onBackToLibrary={() => setAppId(null)}
            onClose={onClose}
          />
        ) : (
          <AppsLibraryScreen
            locale={maisonLocale}
            onOpenApp={(id) => setAppId(id)}
            onBack={onClose}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
