"use client";

/**
 * DesignPanel — unified "Design" surface launched from the single Design dock
 * item. Collapses the former Brand + Theme dock entries (which shipped the
 * byte-identical gear glyph and read as duplicate settings) into ONE entry
 * with two clearly-labelled sections:
 *
 *   - Brand — logo / name / colours / contact. Hosts {@link BrandQuickPanelBody}
 *     unchanged: same governed `agency_business_identity` + `agency_branding`
 *     site-header reads/writes.
 *   - Theme — global design tokens. Launches the existing {@link ThemeDrawer}
 *     (a large right-side surface) which keeps its exact governed
 *     `agency_branding.theme_json` reads/writes + token allow-list. The theme
 *     editor is deliberately its own full-height surface rather than squeezed
 *     into this narrow left panel; the Design panel is the single ENTRY.
 *
 * This component only changes how the two tenant-theme surfaces are ENTERED —
 * neither panel's data model, validation, or governance changes.
 */

import { useEffect, useState } from "react";

import { BrandQuickPanelBody } from "./brand-quick-panel";
import { DockFloatingPanel } from "./dock-floating-panel";
import { useEditContext } from "./edit-context";
import { CHROME, Segmented } from "./kit";

interface DesignPanelProps {
  open: boolean;
  onClose: () => void;
}

type DesignTab = "brand" | "theme";

export function DesignPanel({ open, onClose }: DesignPanelProps) {
  const { canEditTheme, openTheme } = useEditContext();
  const [tab, setTab] = useState<DesignTab>("brand");

  // Reset to the Brand section each time the panel is re-opened so the entry
  // point is predictable.
  useEffect(() => {
    if (open) setTab("brand");
  }, [open]);

  if (!open) return null;

  const showThemeTab = canEditTheme;
  const activeTab: DesignTab = showThemeTab ? tab : "brand";

  return (
    <DockFloatingPanel
      panelId="brand"
      title="Design"
      open={open}
      onClose={onClose}
      width={340}
      testId="design-panel"
      tabs={
        showThemeTab ? (
          <div className="px-[14px] pb-[10px] pt-[2px]">
            <Segmented<DesignTab>
              value={activeTab}
              onChange={setTab}
              fullWidth
              options={[
                { value: "brand", label: "Brand" },
                { value: "theme", label: "Theme" },
              ]}
            />
          </div>
        ) : undefined
      }
    >
      {activeTab === "brand" ? (
        <BrandQuickPanelBody active={open && activeTab === "brand"} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-[12px] px-[14px] py-[14px]">
          <p
            className="m-0 text-[12px] leading-relaxed"
            style={{ color: CHROME.muted }}
          >
            Global theme &amp; tokens — colours, typography, spacing, effects,
            and the code view for the whole site. This opens the full-height
            theme editor.
          </p>
          <button
            type="button"
            data-design-open-theme=""
            onClick={() => {
              openTheme();
              onClose();
            }}
            className="inline-flex cursor-pointer items-center justify-center gap-[8px] rounded-[10px] border-none px-[14px] py-[10px] text-[13px] font-semibold transition-transform motion-safe:active:scale-[0.98]"
            style={{ background: CHROME.accent, color: "#ffffff" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
              <path d="M12 2a10 10 0 1 0 0 20 2.5 2.5 0 0 0 2.5-2.5c0-.55-.22-1.05-.59-1.41a2 2 0 0 1 1.41-3.42H17a5 5 0 0 0 5-5A10 10 0 0 0 12 2z" />
            </svg>
            Open theme editor
          </button>
        </div>
      )}
    </DockFloatingPanel>
  );
}
