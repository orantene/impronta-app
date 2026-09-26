"use client";

/**
 * Maison free-website setup host (PR4–PR5).
 * Flag-off / gate fail → renders nothing so TalentMaxSiteManager keeps today's path.
 * Screens: gallery → detail → review; live card mounts from the manager.
 */
import { useEffect, useEffectEvent, useState } from "react";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { ChooseDesignScreen } from "./ChooseDesignScreen";
import { ThemeDetailScreen } from "./ThemeDetailScreen";
import { ReviewWebsiteScreen } from "./ReviewWebsiteScreen";
import {
  defaultMaisonChoices,
  loadMaisonChoices,
  saveMaisonChoices,
  type MaisonSetupChoices,
} from "./maison-choices";
import { loadMaisonSetupBootstrapAction } from "./maison-setup-bootstrap";
import type { MaisonSetupLocale } from "./maison-setup-copy";

export function MaisonSetupHost({
  onCloseToSite,
  onPublished,
  forceScreen,
  onForceScreenConsumed,
}: {
  /** Close detail → stay on /talent/site manager chrome below. */
  onCloseToSite?: () => void;
  /** After successful publish — manager reloads + shows My website card. */
  onPublished?: () => void;
  /** Optional override (e.g. Change design from the live card). */
  forceScreen?: MaisonSetupChoices["screen"] | null;
  onForceScreenConsumed?: () => void;
}) {
  const rawLocale = useDashboardLocale();
  const locale: MaisonSetupLocale = rawLocale === "es" ? "es" : "en";
  const [talentProfileId, setTalentProfileId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [choices, setChoices] = useState<MaisonSetupChoices>(defaultMaisonChoices);
  const [appliedToast, setAppliedToast] = useState(false);
  const consumeForceScreen = useEffectEvent(() => {
    onForceScreenConsumed?.();
  });

  useEffect(() => {
    let alive = true;
    void loadMaisonSetupBootstrapAction().then((boot) => {
      if (!alive) return;
      if (!boot.enabled) {
        setEnabled(false);
        return;
      }
      setEnabled(true);
      setTalentProfileId(boot.talentProfileId);
      setChoices(loadMaisonChoices(boot.talentProfileId));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!forceScreen || !talentProfileId) return;
    setChoices((prev) => {
      const merged: MaisonSetupChoices = { ...prev, screen: forceScreen, phoneSheet: null };
      saveMaisonChoices(talentProfileId, merged);
      return merged;
    });
    consumeForceScreen();
  }, [forceScreen, talentProfileId]);

  useEffect(() => {
    if (!appliedToast) return;
    const t = window.setTimeout(() => setAppliedToast(false), 6000);
    return () => window.clearTimeout(t);
  }, [appliedToast]);

  const patch = (next: Partial<MaisonSetupChoices>) => {
    setChoices((prev) => {
      const merged = { ...prev, ...next };
      if (talentProfileId) saveMaisonChoices(talentProfileId, merged);
      return merged;
    });
  };

  if (enabled !== true || !talentProfileId) return null;

  return (
    <div data-maison-setup-host="" data-testid="maison-setup-host" id="maison-setup-host" className="mb-6">
      {appliedToast && choices.screen === "review" ? (
        <div
          data-testid="maison-apply-toast"
          className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-900"
        >
          ✓ {locale === "es" ? "Diseño aplicado a tu borrador" : "Design applied to your draft"} ·{" "}
          <span className="font-normal text-emerald-800/90">
            {locale === "es" ? "Deshacer está arriba en Revisar" : "Use Undo on Review"}
          </span>
        </div>
      ) : null}

      {choices.screen === "gallery" ? (
        <ChooseDesignScreen
          locale={locale}
          talentProfileId={talentProfileId}
          onExplore={() => patch({ screen: "detail", status: "Preview" })}
        />
      ) : choices.screen === "review" ? (
        <ReviewWebsiteScreen
          locale={locale}
          talentProfileId={talentProfileId}
          choices={choices}
          onChange={patch}
          onBackToDetail={() => patch({ screen: "detail", phoneSheet: null })}
          onPublished={() => {
            patch({ status: "Live", screen: "gallery" });
            onPublished?.();
          }}
        />
      ) : (
        <ThemeDetailScreen
          locale={locale}
          talentProfileId={talentProfileId}
          choices={choices}
          onChange={patch}
          onBackToGallery={() => patch({ screen: "gallery", phoneSheet: null })}
          onClose={() => {
            patch({ screen: "gallery", phoneSheet: null });
            onCloseToSite?.();
          }}
          onAppliedToReview={() => {
            setAppliedToast(true);
            patch({ screen: "review", status: "Draft saved", phoneSheet: null });
          }}
        />
      )}
    </div>
  );
}
