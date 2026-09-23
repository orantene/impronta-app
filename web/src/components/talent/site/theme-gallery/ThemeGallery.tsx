"use client";

/**
 * ThemeGallery — Phase 0.C. Two steps, Design then Look, sharing ONE live
 * preview iframe (deliverable 0.C-1). `mode: "look-only"` skips the Design
 * step entirely (used when a talent is only allowed to restyle, never
 * replace, their current design).
 *
 * This component owns no data fetching and no server-action wiring: the
 * caller (`TalentMaxSiteManager`) hands it the catalog entries (already
 * tier-locked server-side) and an `onApply` it dispatches to the 0.A actions,
 * including any confirm-before-replace prompt. That keeps this file a pure
 * UI + interaction surface, testable without Supabase or server actions.
 */
import { useEffect, useMemo, useState } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { DesignStep } from "./DesignStep";
import { LookStep } from "./LookStep";
import { ThemeGalleryPreviewFrame } from "./ThemeGalleryPreviewFrame";
import { themeGalleryCopy, type ThemeGalleryLocale } from "./theme-gallery-i18n";
import type { GalleryCatalogEntry, ThemeGalleryApplyInput, ThemeGalleryApplyResult, ThemeGalleryMode, ThemeGalleryStep } from "./types";
import { useThemePreview } from "./useThemePreview";

export type { GalleryCatalogEntry, ThemeGalleryApplyInput, ThemeGalleryApplyResult, ThemeGalleryMode };

export interface ThemeGalleryProps {
  designs: GalleryCatalogEntry[];
  looks: GalleryCatalogEntry[];
  currentDesignSlug?: string | null;
  currentLookSlug?: string | null;
  mode: ThemeGalleryMode;
  onApply: (input: ThemeGalleryApplyInput) => Promise<ThemeGalleryApplyResult>;
  talentProfileId: string;
  locale?: ThemeGalleryLocale | string;
}

export function ThemeGallery({
  designs,
  looks,
  currentDesignSlug,
  currentLookSlug,
  mode,
  onApply,
  talentProfileId,
  locale = "en",
}: ThemeGalleryProps) {
  const [step, setStep] = useState<ThemeGalleryStep>(mode === "look-only" ? "look" : "design");
  const [selectedDesignSlug, setSelectedDesignSlug] = useState<string | null>(
    currentDesignSlug ?? designs.find((d) => !d.locked)?.slug ?? null,
  );
  const [selectedLookSlug, setSelectedLookSlug] = useState<string | null>(
    currentLookSlug ?? looks.find((l) => !l.locked)?.slug ?? null,
  );
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);

  const preview = useThemePreview({ talentProfileId, locale });

  // Only a DESIGN change navigates the iframe. The Look in the URL is the one
  // selected when the design was picked (initial paint); later Look picks
  // restyle in place via `preview.sendTokens`, never a reload.
  const [urlLookSlug, setUrlLookSlug] = useState<string | null>(selectedLookSlug);
  const previewSrc = preview.src;
  const previewUrl = useMemo(() => {
    if (!selectedDesignSlug) return null;
    return previewSrc(selectedDesignSlug, urlLookSlug);
  }, [previewSrc, selectedDesignSlug, urlLookSlug]);

  // A DESIGN change navigates the iframe (new structural tree); reset the
  // visible load state so the frame shows "loading" again for the new src.
  // `preview.beginLoad` is a stable identity (memoized in `useThemePreview`),
  // so listing it here never re-fires this effect on its own.
  useEffect(() => {
    preview.beginLoad();
  }, [selectedDesignSlug, preview.beginLoad]);

  if (designs.length === 0 && mode !== "look-only") {
    return (
      <div style={emptyStateStyle} data-theme-gallery-empty="">
        {themeGalleryCopy(locale, "loadError")}
      </div>
    );
  }

  function selectDesign(design: GalleryCatalogEntry) {
    if (design.slug !== selectedDesignSlug) setUrlLookSlug(selectedLookSlug);
    setSelectedDesignSlug(design.slug);
    setApplySuccess(false);
    setApplyError(null);
  }

  function selectLook(look: GalleryCatalogEntry) {
    setSelectedLookSlug(look.slug);
    setApplySuccess(false);
    setApplyError(null);
  }

  async function handleApply() {
    setApplying(true);
    setApplyError(null);
    setApplySuccess(false);
    const input: ThemeGalleryApplyInput = {};
    if (mode !== "look-only" && selectedDesignSlug) input.designSlug = selectedDesignSlug;
    if (selectedLookSlug) input.lookSlug = selectedLookSlug;
    const result = await onApply(input);
    setApplying(false);
    if (!result.ok) {
      setApplyError(result.error || themeGalleryCopy(locale, "applyErrorGeneric"));
      return;
    }
    setApplySuccess(true);
  }

  const showDesignStep = mode !== "look-only" && step === "design";
  const showLookStep = mode === "look-only" || step === "look";

  return (
    <div data-theme-gallery="" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {mode !== "look-only" ? (
        <div role="tablist" aria-label={themeGalleryCopy(locale, "stepsAria")} style={{ display: "flex", gap: 8 }}>
          <StepTab active={step === "design"} label={themeGalleryCopy(locale, "stepDesign")} onClick={() => setStep("design")} />
          <StepTab active={step === "look"} label={themeGalleryCopy(locale, "stepLook")} onClick={() => setStep("look")} />
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 320px", minWidth: 260 }}>
          {showDesignStep ? (
            <DesignStep
              designs={designs}
              selectedSlug={selectedDesignSlug}
              currentSlug={currentDesignSlug}
              locale={locale}
              onSelect={selectDesign}
            />
          ) : null}
          {showLookStep ? (
            <LookStep
              looks={looks}
              selectedSlug={selectedLookSlug}
              currentSlug={currentLookSlug}
              locale={locale}
              preview={preview}
              onSelect={selectLook}
            />
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {mode !== "look-only" && step === "design" ? (
              <button type="button" onClick={() => setStep("look")} disabled={!selectedDesignSlug} style={primaryBtnStyle}>
                {themeGalleryCopy(locale, "nextToLook")}
              </button>
            ) : null}
            {mode !== "look-only" && step === "look" ? (
              <button type="button" onClick={() => setStep("design")} style={secondaryBtnStyle}>
                {themeGalleryCopy(locale, "backToDesign")}
              </button>
            ) : null}
            {(mode === "look-only" || step === "look") ? (
              <button
                type="button"
                onClick={handleApply}
                disabled={applying || (mode !== "look-only" && !selectedDesignSlug) || !selectedLookSlug}
                style={primaryBtnStyle}
              >
                {applying
                  ? themeGalleryCopy(locale, "applying")
                  : mode === "look-only"
                    ? themeGalleryCopy(locale, "applyLookOnlyButton")
                    : themeGalleryCopy(locale, "applyButton")}
              </button>
            ) : null}
          </div>

          {applyError ? <p style={errorTextStyle}>{applyError}</p> : null}
          {applySuccess ? <p style={successTextStyle}>{themeGalleryCopy(locale, "applySuccess")}</p> : null}
        </div>

        <div style={{ flex: "1 1 220px", minWidth: 220, maxWidth: 320 }}>
          {previewUrl ? (
            <ThemeGalleryPreviewFrame preview={preview} url={previewUrl} locale={locale} title={themeGalleryCopy(locale, "previewTitle")} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StepTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        minHeight: 44,
        padding: "0 16px",
        borderRadius: 10,
        border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
        background: active ? COLORS.accentSoft : "#fff",
        color: COLORS.ink,
        fontSize: 13,
        fontWeight: 700,
        fontFamily: FONTS.body,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 10,
  border: "none",
  background: COLORS.ink,
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: FONTS.body,
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 10,
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.ink,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: FONTS.body,
  cursor: "pointer",
};

const errorTextStyle: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: 12.5,
  color: COLORS.criticalDeep,
  fontFamily: FONTS.body,
};

const successTextStyle: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: 12.5,
  color: COLORS.successDeep,
  fontFamily: FONTS.body,
};

const emptyStateStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: `1px solid ${COLORS.borderSoft}`,
  background: COLORS.surfaceAlt,
  color: COLORS.inkMuted,
  fontSize: 12.5,
  fontFamily: FONTS.body,
};
