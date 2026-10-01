"use client";

/**
 * Maison free-website setup host (PR4–PR8).
 * Flag-off / gate fail → renders nothing so TalentMaxSiteManager keeps today's path.
 * Screens: gallery → detail → review; live card mounts from the manager.
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { saveMaisonSetupChoicesAction } from "@/lib/talent-site/server/maison-choices-actions";
import { ChooseDesignScreen } from "./ChooseDesignScreen";
import { ThemeDetailScreen } from "./ThemeDetailScreen";
import { ReviewWebsiteScreen } from "./ReviewWebsiteScreen";
import {
  defaultMaisonChoices,
  exploreDesignPatch,
  type MaisonExploreOptions,
  isMaisonSetupResumable,
  loadMaisonChoices,
  saveMaisonChoices,
  type MaisonSetupChoices,
} from "./maison-choices";
import { loadMaisonSetupBootstrapAction } from "./maison-setup-bootstrap";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";
import { MaisonUndoToast } from "./MaisonUndoToast";
import { MaisonSetupOverlay } from "./MaisonSetupOverlay";

type HostToast = null | "applied" | "restored";

export function MaisonSetupHost({
  onCloseToSite,
  onPublished,
  forceScreen,
  forceScreenReason = "restored",
  onForceScreenConsumed,
  siteLive = false,
  liveAddress,
  onEnabledChange,
}: {
  /** Live site address (host only), shown in the gallery's change-design banner. */
  liveAddress?: string;
  /** Close detail → stay on /talent/site manager chrome below. */
  onCloseToSite?: () => void;
  /**
   * After successful publish — manager reloads + shows My website card.
   * P5: a live design switch passes its "✓ <Design> is live" toast.
   */
  onPublished?: (toast?: string) => void;
  /** Optional override (e.g. Change design / restore from the live card). */
  forceScreen?: MaisonSetupChoices["screen"] | null;
  /**
   * Why the screen is forced. "restored" = Design options just restored the
   * previous design (the server already wrote it): show the Undo toast.
   * "resume" = a surface (Today, pill, My presence) opens the flow at the
   * talent's current step: READ-ONLY, no toast, no setup_choices write (F58).
   */
  forceScreenReason?: "restored" | "resume";
  onForceScreenConsumed?: () => void;
  /**
   * Site is live with Maison (manager's `maisonLive`). While live, the host
   * renders nothing until a screen is explicitly opened (Change design /
   * restore), so "Choose a design" never sits under the My website card.
   */
  siteLive?: boolean;
  /**
   * AUD-034: reports the Maison setup flag once the bootstrap resolves so the
   * manager can hide the legacy starter-template gallery (one design gallery).
   */
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const rawLocale = useDashboardLocale();
  const locale: MaisonSetupLocale = rawLocale === "es" ? "es" : "en";
  const [talentProfileId, setTalentProfileId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sitePublished, setSitePublished] = useState(false);
  const [liveLookSlug, setLiveLookSlug] = useState<string | null>(null);
  const [liveDesignSlug, setLiveDesignSlug] = useState<string | null>(null);
  const [liveCustomPalette, setLiveCustomPalette] =
    useState<MaisonCustomPaletteStored | null>(null);
  const [choices, setChoices] = useState<MaisonSetupChoices>(defaultMaisonChoices);
  const [toast, setToast] = useState<HostToast>(null);
  /** True once Change design / restore opened a screen while the site is live. */
  const [explicitOpen, setExplicitOpen] = useState(false);
  const serverPersistTimer = useRef<number | null>(null);
  const reportEnabled = useEffectEvent((value: boolean) => {
    onEnabledChange?.(value);
  });
  const consumeForceScreen = useEffectEvent(() => {
    onForceScreenConsumed?.();
  });

  function persistChoices(id: string, next: MaisonSetupChoices) {
    saveMaisonChoices(id, next);
    if (serverPersistTimer.current != null) {
      window.clearTimeout(serverPersistTimer.current);
    }
    serverPersistTimer.current = window.setTimeout(() => {
      void saveMaisonSetupChoicesAction(next);
    }, 250);
  }

  useEffect(() => {
    let alive = true;
    void loadMaisonSetupBootstrapAction().then((boot) => {
      if (!alive) return;
      if (!boot.enabled) {
        setEnabled(false);
        reportEnabled(false);
        return;
      }
      setEnabled(true);
      reportEnabled(true);
      setTalentProfileId(boot.talentProfileId);
      setSitePublished(boot.sitePublished);
      setLiveLookSlug(boot.themeLookSlug);
      setLiveDesignSlug(boot.themeDesignSlug ?? null);
      setLiveCustomPalette(boot.customPalette);
      const local = loadMaisonChoices(boot.talentProfileId);
      // Server wins; migrate resumable local-only choices up once.
      if (boot.setupChoices) {
        setChoices(boot.setupChoices);
        saveMaisonChoices(boot.talentProfileId, boot.setupChoices);
      } else if (isMaisonSetupResumable(local)) {
        setChoices(local);
        void saveMaisonSetupChoicesAction(local);
      } else {
        setChoices(local);
      }
    }).catch((cause: unknown) => {
      // A thrown bootstrap must not leave the tab waiting: fall back to the
      // flag-off path and report it.
      if (!alive) return;
      // eslint-disable-next-line no-console -- report a failed bootstrap (no client logger here)
      console.error("[maison-setup] bootstrap failed", cause);
      setEnabled(false);
      reportEnabled(false);
    });
    return () => {
      alive = false;
      if (serverPersistTimer.current != null) {
        window.clearTimeout(serverPersistTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!forceScreen || !talentProfileId) return;
    const resume = forceScreenReason === "resume";
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
      // Resuming is navigation only: never persist on arrival (F58).
      if (!resume) persistChoices(talentProfileId, merged);
      return merged;
    });
    setExplicitOpen(true);
    // Restore from Design options lands on Review; the panel unmounts, so the
    // "restored · Undo" toast lives here. Never on a plain resume (F58).
    if (forceScreen === "review" && !resume) setToast("restored");
    consumeForceScreen();
  }, [forceScreen, forceScreenReason, talentProfileId, sitePublished]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const patch = (next: Partial<MaisonSetupChoices>) => {
    setChoices((prev) => {
      const merged = { ...prev, ...next };
      if (talentProfileId) persistChoices(talentProfileId, merged);
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

  const body = (
    <>
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
          onExplore={(designSlug: string, opts?: MaisonExploreOptions) =>
            patch(exploreDesignPatch(designSlug, opts))
          }
          onBack={closeToSite}
          onClose={closeToSite}
          liveAddress={siteLive ? liveAddress : undefined}
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
          onDesignPublished={(message, slug) => {
            setLiveDesignSlug(slug);
            setExplicitOpen(false);
            setToast(null);
            onPublished?.(message);
          }}
          liveDesignSlug={liveDesignSlug}
          fromLiveSite={sitePublished}
          liveLookSlug={liveLookSlug}
          liveCustomPalette={liveCustomPalette}
        />
      )}
    </>
  );

  // On a live site the picker is an overlay (like the other dashboard drawers),
  // not a block in the page flow below the site card. First-time setup, before
  // any site exists, IS the page, so it stays inline.
  if (siteLive) {
    return (
      <div data-maison-setup-host="" data-testid="maison-setup-host" id="maison-setup-host">
        <MaisonSetupOverlay
          label={maisonSetupT(locale, "Choose a design")}
          onClose={() => {
            patch({ screen: "gallery", phoneSheet: null });
            closeToSite();
          }}
        >
          {body}
        </MaisonSetupOverlay>
      </div>
    );
  }
  return (
    <div data-maison-setup-host="" data-testid="maison-setup-host" id="maison-setup-host" className="mb-6">
      {body}
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
