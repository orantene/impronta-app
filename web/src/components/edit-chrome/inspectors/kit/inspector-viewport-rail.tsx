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
import { InspectorInfoTip } from "./inspector-info-tip";
import { useInspectorT } from "./use-inspector-t";
import type { ViewportDevice } from "../responsive-field-state";

export interface InspectorViewportRailProps {
  device: ViewportDevice;
  onDeviceChange: (device: ViewportDevice) => void;
  hideOnDevice: boolean;
  onHideChange: (hidden: boolean) => void;
  overrideCount?: number;
  onResetOverrides?: () => void;
  compact?: boolean;
  /**
   * RESP-2 — advisory mobile-health issue count. When > 0, a small count badge
   * is shown on the Mobile device toggle so authors catch issues while editing,
   * not only at publish time. Advisory only — never blocks any action.
   */
  mobileHealthCount?: number;
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
  mobileHealthCount = 0,
}: InspectorViewportRailProps) {
  const breakpoints = useBuilderBreakpoints();

  // Single reconciled source (RESP-1): the rail offers the base tier plus one
  // button per non-base editable registry tier, in the order the registry
  // declares — never a hardcoded 3-device list. Editable tiers are exactly the
  // tiers the renderer emits buckets for, so the editable rail matches render.
  //
  // RESP-2: mobile-family tiers (id "mobile" or "compact") carry the advisory
  // mobileHealthCount badge so authors see it at a glance while editing.
  const deviceOptions = useMemo(() => {
    const railIds = inspectorRailTierIds(breakpoints);
    return railIds.map((id) => {
      const bp =
        breakpoints.find((b) => b.id === id) ??
        ({ id, label: id, minWidth: 0 } as BuilderBreakpoint);
      const isMobileTier = id === "mobile" || id === "compact";
      return {
        key: bp.id,
        label: bp.label,
        hint: tierHint(bp, breakpoints),
        icon: tierIcon(bp.id),
        badgeCount: isMobileTier && mobileHealthCount > 0 ? mobileHealthCount : undefined,
      };
    });
  }, [breakpoints, mobileHealthCount]);

  const baseId = baseBreakpointId(breakpoints);
  const isBase = device === baseId;
  const { t } = useInspectorT();
  const baseLabel = t(breakpointLabelForDevice(baseId, breakpoints));
  const deviceLabel = t(breakpointLabelForDevice(device, breakpoints));

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
        title={
          isBase
            ? t("Switch to tablet or mobile to hide this only there.")
            : undefined
        }
      >
        <span
          className="inline-flex items-center gap-1.5"
          style={{
            fontSize: 12,
            fontWeight: 500,
            // D6 (Inspector Reset P2) — on the base tier the hide write is a
            // no-op (there is no override bucket to write into), so the
            // control is DISABLED instead of rendering enabled-but-inert.
            color: isBase ? CHROME.muted3 : BUILDER_VISUAL.textStrong,
          }}
        >
          {t("Hide on this device")}
          {isBase ? (
            <InspectorInfoTip
              content={t("Switch to tablet or mobile to hide this only there.")}
              title={t("Hide on this device")}
            />
          ) : null}
        </span>
        <Toggle on={hideOnDevice} onChange={onHideChange} disabled={isBase} />
      </div>
      {!isBase ? (
        <div
          className="flex items-center justify-between gap-2"
          style={{ fontSize: 11, color: CHROME.muted }}
        >
          <span>
            {t("Editing {device}").replace("{device}", deviceLabel)}
            {overrideCount > 0
              ? ` · ${t(
                  overrideCount === 1
                    ? "{count} override"
                    : "{count} overrides",
                ).replace("{count}", String(overrideCount))}`
              : ` · ${t("Inherits {base}").replace(
                  "{base}",
                  baseLabel.toLowerCase(),
                )}`}
          </span>
          {overrideCount > 0 && onResetOverrides ? (
            <button
              type="button"
              onClick={onResetOverrides}
              className="cursor-pointer border-none bg-transparent p-0 text-[11px] font-medium"
              style={{ color: BUILDER_VISUAL.accent }}
            >
              {t("Reset")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
