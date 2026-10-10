"use client";

/**
 * TUL-39 — free / non-editing tier still reaches the Apps library.
 * Upsell alone hid Nail Designer; pack + Dev QA need Web Office badge + Upgrade.
 */
import { useEffect, useState } from "react";

import { PresenceLiveFallback } from "@/components/talent/site/PresenceLiveFallback";
import { maisonSetupT, type MaisonSetupLocale } from "@/components/talent/site/maison-setup/maison-setup-copy";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";

export function FreeTierAppsEntry({ locale }: { locale: MaisonSetupLocale }) {
  const [appsOpen, setAppsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("tab") === "apps") {
      setAppsOpen(true);
    }
  }, []);

  return (
    <>
      <div
        data-testid="talent-site-free-apps-entry"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 14,
          padding: "16px 18px",
          fontFamily: FONTS.body,
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 12.5,
            color: COLORS.inkMuted,
            lineHeight: 1.5,
          }}
        >
          {locale === "es"
            ? "Prueba las apps interactivas. Las de Oficina Web piden mejorar el plan para publicarlas."
            : "Try interactive apps. Web Office apps need an upgrade before you can publish them."}
        </p>
        <button
          type="button"
          data-testid="presence-tile-apps"
          onClick={() => setAppsOpen(true)}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-admin-border-soft bg-admin-canvas px-5 text-[14px] font-semibold text-admin-ink"
        >
          {maisonSetupT(locale, "Apps")}
        </button>
      </div>
      {appsOpen ? (
        <PresenceLiveFallback
          screen="apps"
          locale={locale}
          onClose={() => setAppsOpen(false)}
          onApplied={async () => setAppsOpen(false)}
        />
      ) : null}
    </>
  );
}
