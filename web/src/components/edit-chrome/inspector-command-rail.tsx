"use client";

/**
 * InspectorCommandRail — right-side tab strip (Content / Style / Data …).
 *
 * Always visible. Click a tab to open the inspector panel to its left; click
 * the same tab again to close. Draggable like other floating chrome.
 */

import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { MOBILE_RAIL_EXPAND_EVENT } from "./command-dock";
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

  // Phone (max-sm, 640px): collapsed behind a right-edge handle, like the
  // left command dock, so no fixed rail covers the canvas by default. All
  // extra classes are max-sm: scoped, so desktop renders exactly as before.
  const [mobileExpanded, setMobileExpanded] = useState(false);
  useEffect(() => {
    function onOtherRailExpand(event: Event) {
      const detail = (event as CustomEvent<{ side?: string }>).detail;
      if (detail?.side !== "inspector-rail") setMobileExpanded(false);
    }
    window.addEventListener(MOBILE_RAIL_EXPAND_EVENT, onOtherRailExpand);
    return () => window.removeEventListener(MOBILE_RAIL_EXPAND_EVENT, onOtherRailExpand);
  }, []);
  const expandMobileRail = () => {
    setMobileExpanded(true);
    window.dispatchEvent(
      new CustomEvent(MOBILE_RAIL_EXPAND_EVENT, { detail: { side: "inspector-rail" } }),
    );
  };

  return (
    <>
    {!mobileExpanded ? (
      <button
        type="button"
        onClick={expandMobileRail}
        aria-expanded={false}
        aria-label={t("Open section editor tabs")}
        data-mobile-inspector-rail-tab
        className="hidden max-sm:flex fixed items-center justify-center border border-r-0"
        style={{
          right: 0,
          top: INSPECTOR_CHROME_TOP_PX,
          width: 24,
          height: 64,
          borderRadius: "12px 0 0 12px",
          zIndex: Z_INDEX.panels,
          background: CHROME.surface,
          borderColor: CHROME.line,
          boxShadow: RAIL_SHADOW,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
    ) : null}
    <nav
      ref={setPanelNode}
      data-inspector-command-rail=""
      data-inspector-rail-docked={dockedToRail ? "true" : "false"}
      data-mobile-expanded={mobileExpanded ? "true" : "false"}
      aria-label={t("Section editor tabs")}
      className="fixed flex flex-col max-sm:!right-0 max-sm:transition-transform max-sm:duration-300 max-sm:ease-out max-sm:!translate-x-[var(--ec-mobile-rail-x)]"
      style={{
        "--ec-mobile-rail-x": mobileExpanded ? "0px" : "120%",
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
      } as CSSProperties}
    >
      {/* Phone only: a clear way to fold the rail back behind its handle. */}
      <button
        type="button"
        onClick={() => setMobileExpanded(false)}
        aria-label={t("Collapse section editor tabs")}
        className="hidden max-sm:inline-flex items-center justify-center self-end rounded-md p-1"
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
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
            onSelect={(key) => {
              toggleInspectorTab(key);
              setMobileExpanded(false);
            }}
          />
        ))}
      </div>
    </nav>
    </>
  );
}
