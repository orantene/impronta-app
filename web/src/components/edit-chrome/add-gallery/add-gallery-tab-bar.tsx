"use client";

/**
 * Add-gallery tab bar. Extracted from add-gallery-panel.tsx when the panel
 * crossed the 800-line max-lines cap (the paid-plan insert gate pushed it
 * over) — a straight move, no behavior change.
 */

import { CHROME } from "../kit/tokens";
import { useEditorLocale } from "../use-editor-locale";
import type { AddGalleryTab } from "@/lib/site-admin/add-gallery/types";

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: AddGalleryTab; label: string }>;
  active: AddGalleryTab;
  onChange: (tab: AddGalleryTab) => void;
}) {
  const { t } = useEditorLocale();
  return (
    <div
      className="flex shrink-0 gap-0 border-b"
      style={{ borderColor: CHROME.line, padding: "0 16px" }}
      role="tablist"
      aria-label={t("Add gallery tabs")}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className="cursor-pointer rounded-t-[6px] border-none bg-transparent px-[14px] py-[11px] text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40"
            style={{
              color: isActive ? CHROME.accent : CHROME.muted,
              borderBottom: isActive
                ? `2px solid ${CHROME.accent}`
                : "2px solid transparent",
              marginBottom: -1,
            }}
            onMouseEnter={(e) => {
              if (isActive) return;
              e.currentTarget.style.background = "rgba(124, 58, 237, 0.06)";
              e.currentTarget.style.color = CHROME.ink4;
            }}
            onMouseLeave={(e) => {
              if (isActive) return;
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = CHROME.muted;
            }}
          >
            {t(tab.label)}
          </button>
        );
      })}
    </div>
  );
}
