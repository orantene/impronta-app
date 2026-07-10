"use client";

/**
 * InspectorCommandRail — right-side tab strip (Content / Style / Data …).
 *
 * Always visible. Click a tab to open the inspector panel to its left; click
 * the same tab again to close. Draggable like other floating chrome.
 */

import { type ComponentType } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useEditContext } from "./edit-context";
import { useFloatingDrag } from "./floating-panel";
import { inspectorRailDockStyle } from "./inspector-rail-dock";
import { type InspectorTabKey } from "./inspector-tab-config";
import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  INSPECTOR_CHROME_TOP_PX,
  INSPECTOR_RAIL_RIGHT_PX,
  INSPECTOR_RAIL_WIDTH_PX,
  Z_INDEX,
  ensureButtonStyles,
} from "./kit";
import { useInspectorRailCoupling } from "./use-inspector-rail-coupling";
import { useInspectorVisibleTabs } from "./use-inspector-visible-tabs";

const RAIL_RADIUS_PX = CHROME_RADII.xxl;
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
}: {
  tabKey: InspectorTabKey;
  label: string;
  hint: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  active: boolean;
  onSelect: (key: InspectorTabKey) => void;
}) {
  const reduceMotion = useReducedMotion();
  ensureButtonStyles();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-inspector-rail-tab={tabKey}
      data-active={active ? "true" : undefined}
      onClick={() => onSelect(tabKey)}
      title={hint}
      aria-label={label}
      className="ec-rail-item relative flex w-full shrink-0 cursor-pointer flex-col items-center gap-[6px] rounded-[14px] border-none px-[4px] py-[11px] transition-colors"
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
  // The rail is FIXED (W2-C3 removed the drag handle + collapse + pin
  // meta-chrome). We still register the rail node + read its transform so the
  // inspector panel can magnet-dock against it, but there is no affordance to
  // move, pin, or collapse the rail itself.
  const { inspectorRailDocked } = useInspectorRailCoupling("inspector-rail");
  const { setPanelNode, transform } = useFloatingDrag({
    panelId: "inspector-rail",
  });
  const dockedToRail = inspectorRailDocked && inspectorDockOpen;
  const dockStyle = inspectorRailDockStyle(
    dockedToRail,
    false,
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
        ...dockStyle,
      }}
    >
      <div
        role="tablist"
        aria-orientation="vertical"
        className="flex flex-col gap-1"
        style={{ borderRadius: 12 }}
      >
        {tabItems.map((item) => (
          <RailTabButton
            key={item.key}
            tabKey={item.key}
            label={item.label}
            hint={item.hint}
            icon={item.icon}
            active={inspectorDockOpen && inspectorActiveTab === item.key}
            onSelect={(key) => toggleInspectorTab(key)}
          />
        ))}
      </div>
    </nav>
  );
}
