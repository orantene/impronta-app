"use client";

/**
 * Maison free-website setup host (PR4).
 * Flag-off / gate fail → renders nothing so TalentMaxSiteManager keeps today's path.
 */
import { useEffect, useState } from "react";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { ChooseDesignScreen } from "./ChooseDesignScreen";
import { ThemeDetailScreen } from "./ThemeDetailScreen";
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
}: {
  /** Close detail → stay on /talent/site manager chrome below. */
  onCloseToSite?: () => void;
}) {
  const rawLocale = useDashboardLocale();
  const locale: MaisonSetupLocale = rawLocale === "es" ? "es" : "en";
  const [talentProfileId, setTalentProfileId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [choices, setChoices] = useState<MaisonSetupChoices>(defaultMaisonChoices);

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

  const patch = (next: Partial<MaisonSetupChoices>) => {
    setChoices((prev) => {
      const merged = { ...prev, ...next };
      if (talentProfileId) saveMaisonChoices(talentProfileId, merged);
      return merged;
    });
  };

  if (enabled !== true || !talentProfileId) return null;

  return (
    <div data-maison-setup-host="" data-testid="maison-setup-host" className="mb-6">
      {choices.screen === "gallery" ? (
        <ChooseDesignScreen
          locale={locale}
          talentProfileId={talentProfileId}
          onExplore={() => patch({ screen: "detail", status: "Preview" })}
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
        />
      )}
    </div>
  );
}
