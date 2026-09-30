"use client";

/**
 * DesignPanel — unified "Design" surface launched from the single Design dock
 * item. Collapses the former Brand + Theme dock entries (which shipped the
 * byte-identical gear glyph and read as duplicate settings) into ONE entry
 * with two clearly-labelled sections:
 *
 *   - Brand — logo / name / colours / contact. Hosts {@link BrandQuickPanelBody}
 *     unchanged: same governed `agency_business_identity` + `agency_branding`
 *     site-header reads/writes. On talent surfaces, {@link TalentSiteBrandBody}
 *     edits the three site colours.
 *   - Theme — opens the existing {@link ThemeDrawer} immediately (no
 *     interstitial "Abrir editor de tema" step). The Design panel closes so
 *     the canvas keeps one primary chrome surface.
 *
 * This component only changes how the two tenant-theme surfaces are ENTERED —
 * neither panel's data model, validation, or governance changes.
 */

import { useEffect, useState } from "react";

import { BrandQuickPanelBody } from "./brand-quick-panel";
import { TalentSiteBrandBody } from "./talent-site-brand-body";
import { DockFloatingPanel } from "./dock-floating-panel";
import { useEditContext } from "./edit-context";
import { CHROME, Segmented } from "./kit";
import { useEditorLocale } from "./use-editor-locale";

interface DesignPanelProps {
  open: boolean;
  onClose: () => void;
}

type DesignTab = "brand" | "theme";

export function DesignPanel({ open, onClose }: DesignPanelProps) {
  const { canEditTheme, openTheme, surfaceKind } = useEditContext();
  const { t } = useEditorLocale();
  const [tab, setTab] = useState<DesignTab>("brand");

  // Reset to the Brand section each time the panel is re-opened so the entry
  // point is predictable.
  useEffect(() => {
    if (open) setTab("brand");
  }, [open]);

  if (!open) return null;

  const showThemeTab = canEditTheme;

  return (
    <DockFloatingPanel
      panelId="brand"
      title={t("Design")}
      open={open}
      onClose={onClose}
      width={340}
      testId="design-panel"
      tabs={
        showThemeTab ? (
          <div className="px-[14px] pb-[10px] pt-[2px]">
            <Segmented<DesignTab>
              value={tab}
              onChange={(next) => {
                if (next === "theme") {
                  // Tema is an entry, not a second form: open the full theme
                  // editor and yield this panel so the canvas isn't buried.
                  openTheme();
                  onClose();
                  return;
                }
                setTab(next);
              }}
              fullWidth
              options={[
                { value: "brand", label: t("Brand") },
                { value: "theme", label: t("Theme") },
              ]}
            />
            <p
              className="m-0 mt-[8px] text-[11px] leading-snug"
              style={{ color: CHROME.muted2 }}
            >
              {t("Site colours used across every page. Tema opens the full editor.")}
            </p>
          </div>
        ) : undefined
      }
    >
      {/* Brand only — Tema hands off to ThemeDrawer above. */}
      {surfaceKind === "talent_page" ? (
        <TalentSiteBrandBody active={open && tab === "brand"} />
      ) : (
        <BrandQuickPanelBody active={open && tab === "brand"} />
      )}
    </DockFloatingPanel>
  );
}
