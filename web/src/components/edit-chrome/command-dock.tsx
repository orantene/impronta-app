"use client";

/**
 * CommandDock — slim left command rail for the canvas-first builder.
 *
 * Implements the mockup's left dock: a fixed vertical column under the
 * edit topbar. Each item is icon + short label and launches a floating panel;
 * the active item is highlighted, and clicking the active item again closes it.
 */

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { commandDockRailDockStyle } from "./command-dock-rail-dock";
import { useEditContext } from "./edit-context";
import { useFloatingDrag } from "./floating-panel";
import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  COMMAND_DOCK_CHROME_TOP_PX,
  COMMAND_DOCK_LEFT_PX,
  COMMAND_DOCK_PANEL_GAP_PX,
  COMMAND_DOCK_WIDTH_PX,
  Z_INDEX,
  ensureButtonStyles,
} from "./kit";
import { useCommandDockCoupling } from "./use-command-dock-coupling";
import { useEditorLocale } from "./use-editor-locale";

const DOCK_LEFT = COMMAND_DOCK_LEFT_PX;
const DOCK_TOP = COMMAND_DOCK_CHROME_TOP_PX;
const DOCK_WIDTH = COMMAND_DOCK_WIDTH_PX;
const DOCK_RADIUS_PX = CHROME_RADII.xxl;
const DOCK_SHADOW = CHROME_SHADOWS.railCard;

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
  ensureButtonStyles();
  const { active, disabled } = item;
  const reduceMotion = useReducedMotion();
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
        className="group relative mx-auto flex shrink-0 cursor-pointer flex-col items-center gap-[6px] border-none bg-transparent p-0 transition-transform motion-safe:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
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
      title={item.title}
      aria-label={item.label}
      aria-pressed={active}
      data-dock-item={item.id}
      data-dock-active={active ? "true" : undefined}
      data-active={active ? "true" : undefined}
      className="ec-rail-item group relative flex w-full shrink-0 cursor-pointer flex-col items-center gap-[6px] rounded-[14px] border-none px-[4px] py-[11px] transition-[transform,background-color,color] motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {active ? (
        <motion.span
          aria-hidden
          layoutId="command-dock-active-bar"
          initial={false}
          className="absolute left-[-10px] inset-y-0 my-auto h-[24px] w-[3px] rounded-full"
          style={{ background: CHROME.accent }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 520, damping: 40 }
          }
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
  const { t } = useEditorLocale();
  const {
    addMenuOpen,
    toggleAddMenu,
    allPagesPanelOpen,
    toggleAllPagesPanel,
    navigatorOpen,
    toggleNavigator,
    brandPanelOpen,
    toggleBrandPanel,
    shortcutOverlayOpen,
    openShortcutOverlay,
    closeShortcutOverlay,
    assetsOpen,
    openAssets,
    closeAssets,
  } = ctx;

  // Six-item dock (W2-C3): Add · Pages · Structure · Design · Assets · Help.
  // Search collapsed into the ⌘K command palette; Page Settings has a single
  // home in the topbar publish menu; Brand + Theme merged into "Design" (which
  // reuses the former brand-panel open state). Each surviving item keeps a
  // DISTINCT icon — the old Page Settings + Brand gear-glyph collision is gone.
  const primaryItems: DockItem[] = [
    {
      id: "add",
      label: t("Add"),
      title: t("Add gallery"),
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
      label: t("Pages"),
      title: t("All pages"),
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
      label: t("Structure"),
      title: t("Structure (⌘\\)"),
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
      id: "design",
      label: t("Design"),
      title: t("Design (brand + theme)"),
      active: brandPanelOpen,
      onClick: () => toggleBrandPanel(),
      icon: (
        <svg {...ICON_PROPS}>
          <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
          <path d="M12 2a10 10 0 1 0 0 20 2.5 2.5 0 0 0 2.5-2.5c0-.55-.22-1.05-.59-1.41a2 2 0 0 1 1.41-3.42H17a5 5 0 0 0 5-5A10 10 0 0 0 12 2z" />
        </svg>
      ),
    },
    {
      id: "assets",
      label: t("Assets"),
      title: t("Asset library"),
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
  ];

  const helpItem: DockItem = {
    id: "help",
    label: t("Help"),
    title: t("Keyboard shortcuts (?)"),
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

  // The dock is FIXED (W2-C3 removed the drag handle + collapse + pin
  // meta-chrome). We still register the dock node via `setPanelNode` and read
  // its `transform` so floating panels can magnet-dock against it, but there is
  // no user affordance to move, pin, or collapse the rail itself.
  const { commandDockDocked } = useCommandDockCoupling("command-dock");
  const { setPanelNode, transform } = useFloatingDrag({
    panelId: "command-dock",
  });
  const dockedToPanel = commandDockDocked;
  const dockStyle = commandDockRailDockStyle(
    dockedToPanel,
    false,
    DOCK_RADIUS_PX,
    DOCK_SHADOW,
  );
  const dockBorder = `1px solid ${CHROME.line}`;

  return (
    <nav
      ref={setPanelNode}
      data-command-dock
      data-command-dock-docked={dockedToPanel ? "true" : "false"}
      aria-label={t("Builder tools")}
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
        transform,
        ...dockStyle,
      }}
    >
      <div className="flex flex-col gap-1" style={{ borderRadius: 12 }}>
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
