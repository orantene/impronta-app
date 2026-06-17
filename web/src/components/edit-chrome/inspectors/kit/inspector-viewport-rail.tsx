"use client";

/**
 * InspectorViewportRail — compact device sync row for the dock shell (all tabs).
 * Layout tab uses InspectorResponsiveSettings for full layout-scoped fields.
 */

import { useMemo, type ReactNode } from "react";
import { Monitor, MonitorSmartphone, Smartphone, Tablet } from "lucide-react";

import { Toggle } from "../../kit/toggle";
import { CHROME } from "../../kit/tokens";
import {
  type BuilderBreakpoint,
  baseBreakpointId,
  breakpointLabelForDevice,
  inspectorRailTierIds,
} from "../../breakpoint-registry";
import { useBuilderBreakpoints } from "../../use-builder-breakpoints";
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

/** Icon per known tier id; unknown custom tiers fall back to a neutral glyph. */
function tierIcon(id: string): ReactNode {
  switch (id) {
    case "tablet":
      return <Tablet size={18} strokeWidth={1.75} aria-hidden />;
    case "mobile":
    case "compact":
      return <Smartphone size={18} strokeWidth={1.75} aria-hidden />;
    case "desktop":
    case "wide":
      return <Monitor size={18} strokeWidth={1.75} aria-hidden />;
    default:
      return <MonitorSmartphone size={18} strokeWidth={1.75} aria-hidden />;
  }
}

/** Short range hint per tier, derived from the registry min-widths. */
function tierHint(
  tier: BuilderBreakpoint,
  ordered: ReadonlyArray<BuilderBreakpoint>,
): string | undefined {
  if (tier.isBase) return `≥ ${tier.minWidth}px`;
  if (tier.id === "compact") return "narrow phone";
  // Upper bound = the next-larger tier's min-width minus 1.
  const larger = ordered
    .filter((bp) => bp.minWidth > tier.minWidth)
    .sort((a, b) => a.minWidth - b.minWidth)[0];
  if (tier.minWidth <= 0) return larger ? `< ${larger.minWidth}px` : undefined;
  return larger ? `${tier.minWidth}–${larger.minWidth - 1}` : `≥ ${tier.minWidth}px`;
}

export function InspectorViewportRail({
  device,
  onDeviceChange,
  hideOnDevice,
  onHideChange,
  overrideCount = 0,
  onResetOverrides,
  compact = false,
}: InspectorViewportRailProps) {
  const breakpoints = useBuilderBreakpoints();

  // Single reconciled source (RESP-1): the rail offers the base tier plus one
  // button per non-base editable registry tier, in the order the registry
  // declares — never a hardcoded 3-device list. Editable tiers are exactly the
  // tiers the renderer emits buckets for, so the editable rail matches render.
  const deviceOptions = useMemo(() => {
    const railIds = inspectorRailTierIds(breakpoints);
    return railIds.map((id) => {
      const bp =
        breakpoints.find((b) => b.id === id) ??
        ({ id, label: id, minWidth: 0 } as BuilderBreakpoint);
      return {
        key: bp.id,
        label: bp.label,
        hint: tierHint(bp, breakpoints),
        icon: tierIcon(bp.id),
      };
    });
  }, [breakpoints]);

  const baseId = baseBreakpointId(breakpoints);
  const isBase = device === baseId;
  const baseLabel = breakpointLabelForDevice(baseId, breakpoints);
  const deviceLabel = breakpointLabelForDevice(device, breakpoints);

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
        options={deviceOptions}
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
      {!isBase ? (
        <div
          className="flex items-center justify-between gap-2"
          style={{ fontSize: 11, color: CHROME.muted }}
        >
          <span>
            Editing {deviceLabel}
            {overrideCount > 0
              ? ` · ${overrideCount} override${overrideCount === 1 ? "" : "s"}`
              : ` · Inherits ${baseLabel.toLowerCase()}`}
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
          {baseLabel} is the base — switch tiers to add overrides.
        </p>
      )}
    </div>
  );
}
