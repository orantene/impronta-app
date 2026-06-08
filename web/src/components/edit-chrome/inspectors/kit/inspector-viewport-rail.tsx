"use client";

/**
 * InspectorViewportRail — compact device sync row for the dock shell (all tabs).
 * Layout tab uses InspectorResponsiveSettings for full layout-scoped fields.
 */

import { Monitor, Smartphone, Tablet } from "lucide-react";

import { Toggle } from "../../kit/toggle";
import { CHROME } from "../../kit/tokens";
import { BUILDER_VISUAL } from "./tokens";
import { InspectorDeviceCards } from "./inspector-ui";
import type { ViewportDevice } from "../responsive-field-state";

export interface InspectorViewportRailProps {
  device: ViewportDevice;
  onDeviceChange: (device: ViewportDevice) => void;
  hideOnDevice: boolean;
  onHideChange: (hidden: boolean) => void;
  overrideCount?: number;
  onResetOverrides?: () => void;
  compact?: boolean;
}

const DEVICE_OPTIONS = [
  {
    key: "desktop" as const,
    label: "Desktop",
    hint: "≥ 1280px",
    icon: <Monitor size={18} strokeWidth={1.75} aria-hidden />,
  },
  {
    key: "tablet" as const,
    label: "Tablet",
    hint: "768–1279",
    icon: <Tablet size={18} strokeWidth={1.75} aria-hidden />,
  },
  {
    key: "mobile" as const,
    label: "Mobile",
    hint: "< 768px",
    icon: <Smartphone size={18} strokeWidth={1.75} aria-hidden />,
  },
];

export function InspectorViewportRail({
  device,
  onDeviceChange,
  hideOnDevice,
  onHideChange,
  overrideCount = 0,
  onResetOverrides,
  compact = false,
}: InspectorViewportRailProps) {
  return (
    <div
      className="flex flex-col"
      style={{
        gap: 10,
        padding: compact ? "10px 0 12px" : "12px 0 14px",
        borderBottom: `1px solid ${BUILDER_VISUAL.divider}`,
      }}
      data-inspector-viewport-rail=""
    >
      <InspectorDeviceCards
        value={device}
        onChange={onDeviceChange}
        options={DEVICE_OPTIONS}
      />
      <div
        className="flex items-center justify-between gap-3"
        style={{ padding: "0 2px" }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: BUILDER_VISUAL.textStrong,
          }}
        >
          Hide on this device
        </span>
        <Toggle on={hideOnDevice} onChange={onHideChange} />
      </div>
      {device !== "desktop" ? (
        <div
          className="flex items-center justify-between gap-2"
          style={{ fontSize: 11, color: CHROME.muted }}
        >
          <span>
            Editing {device === "tablet" ? "Tablet" : "Mobile"}
            {overrideCount > 0
              ? ` · ${overrideCount} override${overrideCount === 1 ? "" : "s"}`
              : " · Inherits desktop"}
          </span>
          {overrideCount > 0 && onResetOverrides ? (
            <button
              type="button"
              onClick={onResetOverrides}
              className="cursor-pointer border-none bg-transparent p-0 text-[11px] font-medium"
              style={{ color: BUILDER_VISUAL.accent }}
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : (
        <p style={{ fontSize: 11, color: CHROME.muted2, margin: 0, lineHeight: 1.4 }}>
          Desktop is the base — switch to Tablet or Mobile to add overrides.
        </p>
      )}
    </div>
  );
}
