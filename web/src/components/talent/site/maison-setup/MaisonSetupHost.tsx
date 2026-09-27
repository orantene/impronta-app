"use client";

/**
 * Maison free-website setup host (PR4–PR8).
 * Flag-off / gate fail → renders nothing so TalentMaxSiteManager keeps today's path.
 * Screens: gallery → detail → review; live card mounts from the manager.
 */
import { useEffect, useEffectEvent, useState } from "react";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
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
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import { MaisonUndoToast } from "./MaisonUndoToast";

type HostToast = null | "applied" | "restored";

export function MaisonSetupHost({
  onCloseToSite,
  onPublished,
  forceScreen,
  onForceScreenConsumed,
  siteLive = false,
}: {
  /** Close detail → stay on /talent/site manager chrome below. */
  onCloseToSite?: () => void;
  /** After successful publish — manager reloads + shows My website card. */
  onPublished?: () => void;
  /** Optional override (e.g. Change design / restore from the live card). */
  forceScreen?: MaisonSetupChoices["screen"] | null;
  onForceScreenConsumed?: () => void;
  /**
   * Site is live with Maison (manager's `maisonLive`). While live, the host
   * renders nothing until a screen is explicitly opened (Change design /
   * restore), so "Choose a design" never sits under the My website card.
   */
  siteLive?: boolean;
}) {
  const rawLocale = useDashboardLocale();
  const locale: MaisonSetupLocale = rawLocale === "es" ? "es" : "en";
  const [talentProfileId, setTalentProfileId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sitePublished, setSitePublished] = useState(false);
  const [liveLookSlug, setLiveLookSlug] = useState<string | null>(null);
  const [liveCustomPalette, setLiveCustomPalette] =
    useState<MaisonCustomPaletteStored | null>(null);
  const [choices, setChoices] = useState<MaisonSetupChoices>(defaultMaisonChoices);
  const [toast, setToast] = useState<HostToast>(null);
  /** True once Change design / restore opened a screen while the site is live. */
  const [explicitOpen, setExplicitOpen] = useState(false);
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
      setSitePublished(boot.sitePublished);
      setLiveLookSlug(boot.themeLookSlug);
      setLiveCustomPalette(boot.customPalette);
      setChoices(loadMaisonChoices(boot.talentProfileId));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!forceScreen || !talentProfileId) return;
    setChoices((prev) => {
      const merged: MaisonSetupChoices = {
        ...prev,
        screen: forceScreen,
        phoneSheet: null,
        // Change design from live card → My content (spec §10.1).
        ...(forceScreen === "detail" && sitePublished
          ? { contentMode: "mine" as const }
          : {}),
      };
      saveMaisonChoices(talentProfileId, merged);
      return merged;
    });
    setExplicitOpen(true);
    // Restore from Design options lands on Review; the panel unmounts, so the
    // "restored · Undo" toast lives here.
    if (forceScreen === "review") setToast("restored");
    consumeForceScreen();
  }, [forceScreen, talentProfileId, sitePublished]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const patch = (next: Partial<MaisonSetupChoices>) => {
    setChoices((prev) => {
      const merged = { ...prev, ...next };
      if (talentProfileId) saveMaisonChoices(talentProfileId, merged);
      return merged;
    });
  };

  if (enabled !== true || !talentProfileId) return null;
  if (!shouldRenderMaisonSetup({ siteLive, explicitOpen })) return null;

  const closeToSite = () => {
    setExplicitOpen(false);
    setToast(null);
    onCloseToSite?.();
  };

  return (
    <div data-maison-setup-host="" data-testid="maison-setup-host" id="maison-setup-host" className="mb-6">
      {toast && choices.screen === "review" ? (
        <MaisonUndoToast
          locale={locale}
          testId="maison-apply-toast"
          message={maisonSetupT(
            locale,
            toast === "restored"
              ? "Previous design restored to your draft"
              : "Design applied to your draft",
          )}
          onUndone={() => {
            setToast(null);
            if (toast === "restored") {
              patch({ screen: "gallery", phoneSheet: null });
              closeToSite();
              return;
            }
            // Same result as Review's Undo: back to Theme detail.
            patch({ screen: "detail", status: "Choices saved", phoneSheet: null });
          }}
        />
      ) : null}

      {choices.screen === "gallery" ? (
        <ChooseDesignScreen
          locale={locale}
          talentProfileId={talentProfileId}
          onExplore={() => patch({ screen: "detail", status: "Preview" })}
          onBack={closeToSite}
          onClose={closeToSite}
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
            setExplicitOpen(false);
            setToast(null);
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
            closeToSite();
          }}
          onAppliedToReview={() => {
            setToast("applied");
            patch({ screen: "review", status: "Draft saved", phoneSheet: null });
          }}
          onColorsPublished={() => {
            onPublished?.();
          }}
          fromLiveSite={sitePublished}
          liveLookSlug={liveLookSlug}
          liveCustomPalette={liveCustomPalette}
        />
      )}
    </div>
  );
}

/**
 * P0 (audit): once the site is live, the setup screens show only when the
 * talent explicitly opened one (Change design / restore). Otherwise only the
 * My website card renders.
 */
export function shouldRenderMaisonSetup({
  siteLive,
  explicitOpen,
}: {
  siteLive: boolean;
  explicitOpen: boolean;
}): boolean {
  return !siteLive || explicitOpen;
}
