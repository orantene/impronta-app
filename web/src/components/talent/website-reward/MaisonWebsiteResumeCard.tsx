"use client";

/**
 * Today resume card (cr_resume / W75 / AUD-023) — Continue your website when
 * Maison setup choices are saved server-side mid-flow.
 */

import { useEffect, useState } from "react";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  loadMaisonResumeCardAction,
  type MaisonResumeCardState,
} from "@/lib/talent-site/server/maison-choices-actions";
import { buildThemePreviewUrl } from "@/components/talent/site/theme-gallery/useThemePreview";
import { MAISON_PALETTES } from "@/lib/talent-site/theme-catalog/maison/seed";

type Props = {
  onContinue: () => void;
};

export function MaisonWebsiteResumeCard({ onContinue }: Props) {
  const copy = useDashboardText();
  const rawLocale = useDashboardLocale();
  const locale = rawLocale === "es" ? "es" : "en";
  const [state, setState] = useState<MaisonResumeCardState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void loadMaisonResumeCardAction({ locale }).then((next) => {
      if (!live) return;
      setState(next);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [locale]);

  if (!loaded || !state) return null;

  const lookSlug = state.choices.useCustomPalette
    ? null
    : `maison-${state.choices.paletteKey}`;
  const previewUrl = buildThemePreviewUrl({
    designSlug: "maison",
    lookSlug,
    talentProfileId: state.talentProfileId,
    locale,
  });
  const swatch = state.choices.useCustomPalette
    ? state.choices.customPalette?.fields.accent ?? "#A82458"
    : MAISON_PALETTES[state.choices.paletteKey].accent;

  return (
    <section
      data-testid="maison-website-resume-card"
      className="mb-3.5 flex flex-col gap-3.5 rounded-[14px] border border-admin-border-soft bg-white px-4 py-3.5 font-admin-body sm:flex-row sm:items-center"
    >
      <div
        className="relative h-[160px] w-full overflow-hidden rounded-[10px] border border-admin-border-soft sm:h-[120px] sm:w-[200px] sm:shrink-0"
        style={{ background: swatch }}
        aria-hidden
      >
        <iframe
          title=""
          src={previewUrl}
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full origin-top-left scale-[0.28] border-0"
          style={{ width: "357%", height: "357%" }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold text-admin-ink sm:text-[18px]">
          {copy.t("Continue your website")}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-admin-ink-muted sm:text-[14px]">
          {state.summaryLine}
        </p>
        <button
          type="button"
          onClick={onContinue}
          data-testid="maison-website-resume-continue"
          className="mt-3 rounded-[9px] bg-emerald-900 px-4 py-2.5 text-[12.5px] font-bold text-white sm:mt-2.5"
        >
          {copy.t("Continue")}
        </button>
      </div>
    </section>
  );
}
