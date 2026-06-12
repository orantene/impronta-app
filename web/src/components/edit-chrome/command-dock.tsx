"use client";

/**
 * CommandDock — slim left command rail for the canvas-first builder.
 *
 * Implements the mockup's left dock: a fixed vertical column under the
 * edit topbar. Each item is icon + short label and launches a floating panel;
 * the active item is highlighted, and clicking the active item again closes it.
 */

import { useRef, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

import { commandDockRailDockStyle } from "./command-dock-rail-dock";
import { useEditContext } from "./edit-context";
import { useFloatingDrag } from "./floating-panel";
import {
  CHROME,
  COMMAND_DOCK_CHROME_TOP_PX,
  COMMAND_DOCK_LEFT_PX,
  COMMAND_DOCK_PANEL_GAP_PX,
  COMMAND_DOCK_WIDTH_PX,
  Z_INDEX,
} from "./kit";
import { useCommandDockCoupling } from "./use-command-dock-coupling";

const DOCK_LEFT = COMMAND_DOCK_LEFT_PX;
const DOCK_TOP = COMMAND_DOCK_CHROME_TOP_PX;
const DOCK_WIDTH = COMMAND_DOCK_WIDTH_PX;
const DOCK_RADIUS_PX = 20;
const DOCK_SHADOW =
  "0 1px 2px rgba(0,0,0,0.04), 0 10px 28px -12px rgba(0,0,0,0.14)";

/** Left inset for dock-launched floating panels (dock + gap). */
export const COMMAND_DOCK_PANEL_INSET_PX =
  DOCK_LEFT + DOCK_WIDTH + COMMAND_DOCK_PANEL_GAP_PX;

/** Flush left edge when a panel is magnet-locked to the command dock. */
export const COMMAND_DOCK_PANEL_FLUSH_LEFT_PX = DOCK_LEFT + DOCK_WIDTH;

const DOCK_ICON_PX = 22;
const DOCK_LABEL_PX = 11;

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
  const isAdd = item.id === "add";

  if (isAdd) {
    return (
      <button
        type="button"
        onClick={item.onClick}
        disabled={disabled}
        title={item.title}
        aria-label={item.label}
        aria-pressed={active}
        data-dock-item={item.id}
        data-dock-active={active ? "true" : undefined}
        className="group relative mx-auto flex shrink-0 cursor-pointer flex-col items-center gap-[6px] border-none bg-transparent p-0 transition-transform disabled:cursor-not-allowed disabled:opacity-40"
        style={{ width: "100%", padding: "4px 0 8px" }}
      >
        <span
          aria-hidden
          className="inline-flex items-center justify-center transition-transform group-hover:scale-[1.02]"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "rgba(124, 58, 237, 0.10)",
          }}
        >
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: active ? CHROME.accentInk : CHROME.accent,
              color: "#ffffff",
              boxShadow: active
                ? "0 0 0 3px rgba(124, 58, 237, 0.24), 0 8px 20px -6px rgba(124, 58, 237, 0.45)"
                : "0 8px 20px -6px rgba(124, 58, 237, 0.38)",
            }}
          >
            {item.icon}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            fontSize: DOCK_LABEL_PX,
            fontWeight: 600,
            letterSpacing: "0.01em",
            lineHeight: 1.15,
            textAlign: "center",
            color: CHROME.accent,
          }}
        >
          {item.label}
        </span>
      </button>
    );
  }

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
      className="group relative flex w-full shrink-0 cursor-pointer flex-col items-center gap-[6px] rounded-[14px] border-none px-[4px] py-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: active ? "rgba(124, 58, 237, 0.10)" : "transparent",
        color: active ? CHROME.accent : CHROME.muted,
      }}
      onMouseEnter={(e) => {
        if (disabled || active) return;
        e.currentTarget.style.background = "rgba(124, 58, 237, 0.06)";
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
          className="absolute left-[-10px] top-1/2 h-[24px] w-[3px] -translate-y-1/2 rounded-full"
          style={{ background: CHROME.accent }}
        />
      ) : null}
      <span
        aria-hidden
        className="inline-flex items-center justify-center"
        style={{ width: 26, height: 26 }}
      >
        {item.icon}
      </span>
      <span
        aria-hidden
        style={{
          fontSize: DOCK_LABEL_PX,
          fontWeight: 600,
          letterSpacing: "0.01em",
          lineHeight: 1.15,
          textAlign: "center",
          color: "inherit",
          maxWidth: "100%",
          padding: "0 2px",
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

const ICON_PROPS = {
  width: DOCK_ICON_PX,
  height: DOCK_ICON_PX,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function CommandDock() {
  const ctx = useEditContext();
  const {
    searchPanelOpen,
    toggleSearchPanel,
    addMenuOpen,
    toggleAddMenu,
    allPagesPanelOpen,
    toggleAllPagesPanel,
    navigatorOpen,
    toggleNavigator,
    pageSettingsOpen,
    openPageSettings,
    closePageSettings,
    brandPanelOpen,
    toggleBrandPanel,
    canEditTheme,
    themeOpen,
    openTheme,
    closeTheme,
    shortcutOverlayOpen,
    openShortcutOverlay,
    closeShortcutOverlay,
    assetsOpen,
    openAssets,
    closeAssets,
  } = ctx;

  const primaryItems: DockItem[] = [
    {
      id: "search",
      label: "Search",
      title: "Search (⌘K also opens command palette)",
      active: searchPanelOpen,
      onClick: () => toggleSearchPanel(),
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
      title: "Add gallery",
      active: addMenuOpen,
      onClick: () => toggleAddMenu(),
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
      active: allPagesPanelOpen,
      onClick: () => toggleAllPagesPanel(),
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      id: "structure",
      label: "Page Structure",
      title: "Page structure (⌘\\)",
      active: navigatorOpen,
      onClick: () => toggleNavigator(),
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
      id: "pageSettings",
      label: "Page Settings",
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
      id: "assets",
      label: "Assets",
      title: "Asset library",
      active: assetsOpen,
      onClick: () => (assetsOpen ? closeAssets() : openAssets()),
      icon: (
        <svg {...ICON_PROPS}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ),
    },
    {
      id: "brand",
      label: "Brand",
      title: "Brand",
      active: brandPanelOpen,
      onClick: () => toggleBrandPanel(),
      icon: (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  // Theme is offered when the surface's `themeTokens` capability is on (Max
  // talents) OR the operator may edit the site shell (homepage / workspace).
  // `canEditTheme = capabilities.themeTokens || canEditSiteShell`. The talent
  // path now has a backend (talent_pages.theme via the surface-aware drawer),
  // so the drawer no longer 401s for a Max talent.
  if (canEditTheme) {
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

  const { dragOptions, commandDockDocked } =
    useCommandDockCoupling("command-dock");
  const {
    setPanelNode,
    onHandlePointerDown,
    transform,
    dragging,
    offset,
  } = useFloatingDrag(dragOptions);
  const moved = offset.x !== 0 || offset.y !== 0;
  const dragMovedRef = useRef(false);
  const dockedToPanel = commandDockDocked;
  const dockStyle = commandDockRailDockStyle(
    dockedToPanel,
    dragging,
    DOCK_RADIUS_PX,
    DOCK_SHADOW,
  );
  const dockBorder = `1px solid ${CHROME.line}`;

  return (
    <nav
      ref={setPanelNode}
      data-command-dock
      data-command-dock-docked={dockedToPanel ? "true" : "false"}
      aria-label="Builder tools"
      className="fixed flex flex-col"
      style={{
        left: DOCK_LEFT,
        top: DOCK_TOP,
        width: DOCK_WIDTH,
        maxHeight: `calc(100vh - ${DOCK_TOP + 16}px)`,
        zIndex: Z_INDEX.panels + 1,
        background: CHROME.surface,
        borderTop: dockBorder,
        borderBottom: dockBorder,
        borderLeft: dockBorder,
        borderRight: dockedToPanel ? "none" : dockBorder,
        padding: "14px 8px 12px",
        gap: 4,
        transform,
        userSelect: dragging ? "none" : undefined,
        ...dockStyle,
      }}
    >
      <button
        type="button"
        aria-label="Drag tab strip"
        title="Drag to move"
        onPointerDown={(e) => {
          dragMovedRef.current = false;
          const startX = e.clientX;
          const startY = e.clientY;
          const onMove = (ev: PointerEvent) => {
            if (
              Math.abs(ev.clientX - startX) > 4 ||
              Math.abs(ev.clientY - startY) > 4
            ) {
              dragMovedRef.current = true;
            }
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener(
            "pointerup",
            () => window.removeEventListener("pointermove", onMove),
            { once: true },
          );
          onHandlePointerDown(e);
        }}
        className="mx-auto mb-2 inline-flex cursor-grab items-center justify-center border-none bg-transparent p-0 active:cursor-grabbing"
        style={{ color: CHROME.muted3, height: 20 }}
      >
        <GripVertical size={16} strokeWidth={2.25} aria-hidden />
      </button>

      <div
        className="flex flex-col gap-1"
        style={{
          background: moved ? "rgba(124, 58, 237, 0.03)" : undefined,
          borderRadius: 12,
        }}
      >
      {primaryItems.map((item) => (
        <DockButton key={item.id} item={item} />
      ))}
      </div>
      <span aria-hidden className="flex-1" />
      <span
        aria-hidden
        className="my-[6px] h-px w-full shrink-0"
        style={{ background: CHROME.line }}
      />
      <DockButton item={helpItem} />
    </nav>
  );
}
