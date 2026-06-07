"use client";

/**
 * CommandDock — slim left command rail for the canvas-first builder.
 *
 * Implements the mockup's left dock (`Page_builder_Mockup`): a thin, fixed
 * vertical column under the 54px topbar. Each item is icon + short label and
 * launches a floating panel / surface; the active item is highlighted, and
 * clicking the active item again closes its surface.
 *
 * The dock is purely a LAUNCHER. It owns no state of its own — every action
 * routes through the existing `EditContext` open/close handlers so the drawer
 * mutex, deep-link dispatch, and Escape ladder keep working unchanged.
 *
 * Phase 1 wiring (panels get re-skinned in Phase 2):
 *   Search          → command palette (⌘K) surface
 *   Add             → composition library overlay (default add slot)
 *   All Pages       → page picker popover
 *   Page Structure  → navigator (Layers/Outline/Classes)
 *   Page Settings   → page settings drawer
 *   Brand           → disabled placeholder (panel arrives in Phase 2)
 *   Theme           → theme drawer (site-shell editors only)
 *   Help            → keyboard-shortcuts overlay
 */

import { type ReactNode } from "react";

import { useEditContext } from "./edit-context";
import { defaultSectionAddSlot } from "./default-section-add-slot";
import { CHROME, Z_INDEX } from "./kit";

const TOPBAR_H = 54;
const DOCK_TOP = TOPBAR_H + 12;
const DOCK_WIDTH = 64;

interface DockItem {
  id: string;
  label: string;
  title: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function DockButton({ item }: { item: DockItem }) {
  const { active, disabled } = item;
  return (
    <button
      type="button"
      onClick={item.onClick}
      disabled={disabled}
      title={disabled ? `${item.title} — coming soon` : item.title}
      aria-label={item.label}
      aria-pressed={active}
      data-dock-item={item.id}
      data-dock-active={active ? "true" : undefined}
      className="group relative flex w-full shrink-0 cursor-pointer flex-col items-center gap-[3px] rounded-[12px] border-none px-[2px] py-[7px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: active ? "rgba(61, 79, 124, 0.12)" : "transparent",
        color: active ? CHROME.accentInk : CHROME.muted,
      }}
      onMouseEnter={(e) => {
        if (disabled || active) return;
        e.currentTarget.style.background = "rgba(24, 24, 27, 0.05)";
        e.currentTarget.style.color = CHROME.ink2;
      }}
      onMouseLeave={(e) => {
        if (disabled || active) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.muted;
      }}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-[-8px] top-1/2 h-[20px] w-[3px] -translate-y-1/2 rounded-full"
          style={{ background: CHROME.accent }}
        />
      ) : null}
      <span
        aria-hidden
        className="inline-flex items-center justify-center"
        style={{ width: 22, height: 22 }}
      >
        {item.icon}
      </span>
      <span
        aria-hidden
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.01em",
          lineHeight: 1.05,
          textAlign: "center",
          color: "inherit",
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function CommandDock() {
  const ctx = useEditContext();
  const {
    paletteOpen,
    togglePalette,
    closePalette,
    libraryTarget,
    openLibrary,
    closeLibrary,
    slotDefs,
    slots,
    requestPagesPickerOpen,
    navigatorOpen,
    toggleNavigator,
    pageSettingsOpen,
    openPageSettings,
    closePageSettings,
    canEditSiteShell,
    themeOpen,
    openTheme,
    closeTheme,
    shortcutOverlayOpen,
    openShortcutOverlay,
    closeShortcutOverlay,
  } = ctx;

  const primaryItems: DockItem[] = [
    {
      id: "search",
      label: "Search",
      title: "Search (⌘K)",
      active: paletteOpen,
      onClick: () => (paletteOpen ? closePalette() : togglePalette()),
      icon: (
        <svg {...ICON_PROPS}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      ),
    },
    {
      id: "add",
      label: "Add",
      title: "Add section or element",
      active: libraryTarget != null,
      onClick: () =>
        libraryTarget != null
          ? closeLibrary()
          : openLibrary({
              slotKey: defaultSectionAddSlot(slotDefs, slots),
              insertAfterSortOrder: null,
            }),
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      ),
    },
    {
      id: "pages",
      label: "All Pages",
      title: "All pages",
      active: false,
      onClick: () => requestPagesPickerOpen(),
      icon: (
        <svg {...ICON_PROPS}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      id: "structure",
      label: "Structure",
      title: "Page structure (⌘\\)",
      active: navigatorOpen,
      onClick: () => toggleNavigator(),
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M3 5h18" />
          <path d="M8 12h13" />
          <path d="M8 19h13" />
          <path d="M4 12h.01" />
          <path d="M4 19h.01" />
        </svg>
      ),
    },
    {
      id: "pageSettings",
      label: "Settings",
      title: "Page settings",
      active: pageSettingsOpen,
      onClick: () => (pageSettingsOpen ? closePageSettings() : openPageSettings()),
      icon: (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
    {
      id: "brand",
      label: "Brand",
      title: "Brand",
      active: false,
      disabled: true,
      onClick: () => {},
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M2 12a10 10 0 1 0 10-10 10 10 0 0 0-10 10z" />
          <path d="M12 2v20" />
          <path d="M2 12h20" />
        </svg>
      ),
    },
  ];

  if (canEditSiteShell) {
    primaryItems.push({
      id: "theme",
      label: "Theme",
      title: "Theme",
      active: themeOpen,
      onClick: () => (themeOpen ? closeTheme() : openTheme()),
      icon: (
        <svg {...ICON_PROPS}>
          <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
          <path d="M12 2a10 10 0 1 0 0 20 2.5 2.5 0 0 0 2.5-2.5c0-.55-.22-1.05-.59-1.41a2 2 0 0 1 1.41-3.42H17a5 5 0 0 0 5-5A10 10 0 0 0 12 2z" />
        </svg>
      ),
    });
  }

  const helpItem: DockItem = {
    id: "help",
    label: "Help",
    title: "Keyboard shortcuts (?)",
    active: shortcutOverlayOpen,
    onClick: () =>
      shortcutOverlayOpen ? closeShortcutOverlay() : openShortcutOverlay(),
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  };

  return (
    <nav
      data-command-dock
      aria-label="Builder tools"
      className="fixed flex flex-col"
      style={{
        left: 12,
        top: DOCK_TOP,
        width: DOCK_WIDTH,
        maxHeight: `calc(100vh - ${DOCK_TOP + 12}px)`,
        zIndex: Z_INDEX.panels,
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: 16,
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -10px rgba(0,0,0,0.12)",
        padding: "8px 6px",
        gap: 2,
      }}
    >
      {primaryItems.map((item) => (
        <DockButton key={item.id} item={item} />
      ))}
      <span aria-hidden className="flex-1" />
      <span
        aria-hidden
        className="my-[2px] h-px w-full shrink-0"
        style={{ background: CHROME.line }}
      />
      <DockButton item={helpItem} />
    </nav>
  );
}
