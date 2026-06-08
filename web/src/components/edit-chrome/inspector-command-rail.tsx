"use client";

/**
 * InspectorCommandRail — right-side tab strip (Content / Style / Data …).
 *
 * Always visible. Click a tab to open the inspector panel to its left; click
 * the same tab again to close. Draggable like other floating chrome.
 */

import { useRef, type ComponentType, type MutableRefObject } from "react";
import { GripVertical } from "lucide-react";

import { useEditContext } from "./edit-context";
import { useFloatingDrag } from "./floating-panel";
import { inspectorRailDockStyle } from "./inspector-rail-dock";
import type { InspectorTabKey } from "./inspector-tab-config";
import {
  CHROME,
  INSPECTOR_CHROME_TOP_PX,
  INSPECTOR_RAIL_RIGHT_PX,
  INSPECTOR_RAIL_WIDTH_PX,
  Z_INDEX,
} from "./kit";
import { useInspectorRailCoupling } from "./use-inspector-rail-coupling";
import { useInspectorVisibleTabs } from "./use-inspector-visible-tabs";

const RAIL_RADIUS_PX = 20;
const TAB_ICON_PX = 22;
const TAB_LABEL_PX = 11;
const RAIL_SHADOW =
  "0 1px 2px rgba(0,0,0,0.04), 0 10px 28px -12px rgba(0,0,0,0.14)";

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
      <span
        aria-hidden
        className="absolute inset-x-2 bottom-1 h-[2px] rounded-full transition-opacity"
        style={{
          background: CHROME.accent,
          opacity: active ? 1 : 0,
        }}
      />
    </button>
  );
}

export function InspectorCommandRail() {
  const { inspectorDockOpen, toggleInspectorTab, inspectorActiveTab } =
    useEditContext();
  const { tabItems } = useInspectorVisibleTabs();
  const { dragOptions, inspectorRailDocked } =
    useInspectorRailCoupling("inspector-rail");
  const dockedToRail = inspectorRailDocked && inspectorDockOpen;
  const {
    setPanelNode,
    onHandlePointerDown,
    transform,
    dragging,
    offset,
  } = useFloatingDrag(dragOptions);
  const moved = offset.x !== 0 || offset.y !== 0;
  const dragMovedRef = useRef(false);
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
        role="tablist"
        aria-orientation="vertical"
        className="flex flex-col gap-1"
        style={{
          background: moved ? "rgba(124, 58, 237, 0.03)" : undefined,
          borderRadius: 12,
        }}
      >
        {tabItems.map((item) => (
          <RailTabButton
            key={item.key}
            tabKey={item.key}
            label={item.label}
            hint={item.hint}
            icon={item.icon}
            active={inspectorDockOpen && inspectorActiveTab === item.key}
            dragMovedRef={dragMovedRef}
            onSelect={(key) => toggleInspectorTab(key)}
          />
        ))}
      </div>
    </nav>
  );
}
