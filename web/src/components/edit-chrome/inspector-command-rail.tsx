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
import { useEditorLocale } from "./use-editor-locale";

const RAIL_RADIUS_PX = CHROME_RADII.xxl;
const TAB_ICON_PX = 20;
const TAB_LABEL_PX = 10;
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
      className="ec-rail-item relative flex w-full shrink-0 cursor-pointer flex-col items-center gap-[5px] rounded-[12px] border-none px-[3px] py-[10px] transition-[background-color,color,box-shadow,transform] duration-150 motion-safe:active:scale-[0.97]"
    >
      <Icon size={TAB_ICON_PX} strokeWidth={active ? 2.15 : 1.9} aria-hidden />
      <span
        aria-hidden
        className="max-w-full truncate font-semibold leading-[1.1] tracking-[0.005em]"
        style={{ fontSize: TAB_LABEL_PX, textAlign: "center", padding: "0 1px" }}
      >
        {label}
      </span>
      {active ? (
        <motion.span
          aria-hidden
          layoutId="inspector-rail-active-indicator"
          initial={false}
          className="absolute left-0.5 top-2 bottom-2 w-[3px] rounded-full"
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
  const { t } = useEditorLocale();
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
      aria-label={t("Section editor tabs")}
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
        padding: "12px 7px 10px",
        transform,
        ...dockStyle,
      }}
    >
      <div
        role="tablist"
        aria-orientation="vertical"
        className="flex flex-col gap-0.5"
        style={{ borderRadius: 12 }}
      >
        {tabItems.map((item) => (
          <RailTabButton
            key={item.key}
            tabKey={item.key}
            label={t(item.label)}
            hint={t(item.hint)}
            icon={item.icon}
            active={inspectorDockOpen && inspectorActiveTab === item.key}
            onSelect={(key) => toggleInspectorTab(key)}
          />
        ))}
      </div>
    </nav>
  );
}
