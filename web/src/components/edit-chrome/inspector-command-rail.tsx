"use client";

/**
 * InspectorCommandRail — right-side tab strip (Content / Style / Data …).
 *
 * Always visible. Click a tab to open the inspector panel to its left; click
 * the same tab again to close. Draggable like other floating chrome.
 */

import { useRef, type ComponentType, type MutableRefObject } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useEditContext } from "./edit-context";
import { useFloatingDrag } from "./floating-panel";
import { inspectorRailDockStyle } from "./inspector-rail-dock";
import {
  INSPECTOR_TABS,
  inspectorTabItemsForKeys,
  type InspectorTabKey,
} from "./inspector-tab-config";
import {
  CHROME,
  CHROME_SHADOWS,
  INSPECTOR_CHROME_TOP_PX,
  INSPECTOR_RAIL_COLLAPSED_STORAGE_KEY,
  INSPECTOR_RAIL_PINNED_STORAGE_KEY,
  INSPECTOR_RAIL_RIGHT_PX,
  INSPECTOR_RAIL_WIDTH_PX,
  PinnableRailItem,
  RailHandle,
  useRailCollapsed,
  useRailPinned,
  Z_INDEX,
} from "./kit";
import { useInspectorRailCoupling } from "./use-inspector-rail-coupling";
import { useInspectorVisibleTabs } from "./use-inspector-visible-tabs";

const RAIL_RADIUS_PX = 20;
const TAB_ICON_PX = 22;
const TAB_LABEL_PX = 11;
const RAIL_SHADOW = CHROME_SHADOWS.railCard;

function RailTabButton({
  tabKey,
  label,
  hint,
  icon: Icon,
  active,
  onSelect,
  dragMovedRef,
}: {
  tabKey: InspectorTabKey;
  label: string;
  hint: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  active: boolean;
  onSelect: (key: InspectorTabKey) => void;
  dragMovedRef: MutableRefObject<boolean>;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-inspector-rail-tab={tabKey}
      onClick={() => {
        if (dragMovedRef.current) return;
        onSelect(tabKey);
      }}
      title={hint}
      aria-label={label}
      className="relative flex w-full shrink-0 cursor-pointer flex-col items-center gap-[6px] rounded-[14px] border-none px-[4px] py-[11px] transition-colors"
      style={{
        background: active ? "rgba(124, 58, 237, 0.10)" : "transparent",
        color: active ? CHROME.accent : CHROME.muted,
      }}
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.background = "rgba(124, 58, 237, 0.06)";
        e.currentTarget.style.color = CHROME.ink2;
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.muted;
      }}
    >
      <Icon size={TAB_ICON_PX} strokeWidth={2} aria-hidden />
      <span
        aria-hidden
        className="max-w-full truncate font-semibold leading-[1.15] tracking-[0.01em]"
        style={{ fontSize: TAB_LABEL_PX, textAlign: "center", padding: "0 2px" }}
      >
        {label}
      </span>
      {active ? (
        <motion.span
          aria-hidden
          layoutId="inspector-rail-active-underline"
          initial={false}
          className="absolute inset-x-2 bottom-1 h-[2px] rounded-full"
          style={{ background: CHROME.accent }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 520, damping: 40 }
          }
        />
      ) : null}
    </button>
  );
}

export function InspectorCommandRail() {
  const { inspectorDockOpen, toggleInspectorTab, inspectorActiveTab } =
    useEditContext();
  const { tabItems } = useInspectorVisibleTabs();
  const { dragOptions, inspectorRailDocked } =
    useInspectorRailCoupling("inspector-rail");
  const {
    setPanelNode,
    onHandlePointerDown,
    transform,
    dragging,
    offset,
  } = useFloatingDrag(dragOptions);
  const moved = offset.x !== 0 || offset.y !== 0;
  const dragMovedRef = useRef(false);
  const [collapsed, toggleCollapsed] = useRailCollapsed(
    INSPECTOR_RAIL_COLLAPSED_STORAGE_KEY,
  );
  const { isPinned, togglePinned } = useRailPinned(
    INSPECTOR_RAIL_PINNED_STORAGE_KEY,
  );
  // Tabs kept visible while the rail is collapsed (in their natural order).
  // Sourced from the FULL tab list, not the selection-scoped `tabItems`, so a
  // pinned tab never silently vanishes from the pill when the current selection
  // happens not to expose it (e.g. a section without a Motion tab).
  const collapsedPinnedTabs = inspectorTabItemsForKeys(
    INSPECTOR_TABS.map((t) => t.key),
  ).filter((item) => isPinned(item.key));
  // While collapsed the rail is a standalone handle pill — drop the docked
  // "merge" styling so it renders as a clean rounded card rather than a short
  // stub mating against the still-tall inspector panel.
  const dockedToRail = inspectorRailDocked && inspectorDockOpen && !collapsed;
  const dockStyle = inspectorRailDockStyle(
    dockedToRail,
    dragging,
    RAIL_RADIUS_PX,
    RAIL_SHADOW,
  );
  const railBorder = `1px solid ${CHROME.line}`;

  return (
    <nav
      ref={setPanelNode}
      data-inspector-command-rail=""
      data-inspector-rail-docked={dockedToRail ? "true" : "false"}
      aria-label="Section editor tabs"
      className="fixed flex flex-col"
      style={{
        right: INSPECTOR_RAIL_RIGHT_PX,
        top: INSPECTOR_CHROME_TOP_PX,
        width: INSPECTOR_RAIL_WIDTH_PX,
        zIndex: Z_INDEX.panels + 1,
        background: CHROME.surface,
        borderTop: railBorder,
        borderBottom: railBorder,
        borderRight: railBorder,
        borderLeft: dockedToRail ? "none" : railBorder,
        padding: "14px 8px 12px",
        transform,
        userSelect: dragging ? "none" : undefined,
        ...dockStyle,
      }}
    >
      <RailHandle
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onHandlePointerDown={onHandlePointerDown}
        dragMovedRef={dragMovedRef}
        collapseLabel="tabs"
      />

      {collapsed
        ? collapsedPinnedTabs.length > 0 && (
            <div
              role="tablist"
              aria-orientation="vertical"
              className="flex flex-col gap-1"
              style={{ borderRadius: 12 }}
            >
              {collapsedPinnedTabs.map((item) => (
                <PinnableRailItem
                  key={item.key}
                  pinned
                  onTogglePinned={() => togglePinned(item.key)}
                  label={item.label}
                  showPinnedIndicator={false}
                >
                  <RailTabButton
                    tabKey={item.key}
                    label={item.label}
                    hint={item.hint}
                    icon={item.icon}
                    active={inspectorDockOpen && inspectorActiveTab === item.key}
                    dragMovedRef={dragMovedRef}
                    onSelect={(key) => toggleInspectorTab(key)}
                  />
                </PinnableRailItem>
              ))}
            </div>
          )
        : (
          <div
            role="tablist"
            aria-orientation="vertical"
            className="flex flex-col gap-1"
            style={{
              background: moved ? "rgba(124, 58, 237, 0.03)" : undefined,
              borderRadius: 12,
            }}
          >
            {tabItems.map((item) => (
              <PinnableRailItem
                key={item.key}
                pinned={isPinned(item.key)}
                onTogglePinned={() => togglePinned(item.key)}
                label={item.label}
                showPinnedIndicator
              >
                <RailTabButton
                  tabKey={item.key}
                  label={item.label}
                  hint={item.hint}
                  icon={item.icon}
                  active={inspectorDockOpen && inspectorActiveTab === item.key}
                  dragMovedRef={dragMovedRef}
                  onSelect={(key) => toggleInspectorTab(key)}
                />
              </PinnableRailItem>
            ))}
          </div>
        )}
    </nav>
  );
}
