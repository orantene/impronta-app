"use client";

/**
 * InspectorResponsiveSettings — full responsive block at top of Layout tab.
 */

import { PRESENTATION_FIELD_LABELS, PRESENTATION_OPTIONS } from "@/lib/site-admin/sections/shared/presentation";

import {
  InspectorField,
  InspectorSection,
  InspectorSelect,
} from "./inspector-ui";
import { InspectorViewportRail } from "./inspector-viewport-rail";
import { getPresentationOverrideDevice } from "../responsive-field-state";
import type { ViewportDevice } from "../responsive-field-state";

export interface InspectorResponsiveSettingsProps {
  device: ViewportDevice;
  onDeviceChange: (device: ViewportDevice) => void;
  presentation: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  onDeepPatch?: (patch: Record<string, unknown>) => void;
  hideOnDevice: boolean;
  onHideChange: (hidden: boolean) => void;
  overrideCount?: number;
  onResetOverrides?: () => void;
  stackOrderPlaceholder?: boolean;
}

function paddingLabel(value: string): string {
  const opt = PRESENTATION_OPTIONS.paddingTop.find((o) => o.value === value);
  return opt?.label ?? value;
}

export function InspectorResponsiveSettings({
  device,
  onDeviceChange,
  presentation,
  onPatch,
  onDeepPatch,
  hideOnDevice,
  onHideChange,
  overrideCount,
  onResetOverrides,
  stackOrderPlaceholder = true,
}: InspectorResponsiveSettingsProps) {
  const val = (key: string): string =>
    (presentation[key] as string | undefined) ?? "";

  const bp =
    (presentation.breakpoints as
      | Partial<Record<"tablet" | "mobile", Record<string, unknown>>>
      | undefined) ?? {};
  const activeBucket =
    device === "tablet" || device === "mobile" ? bp[device] ?? {} : null;

  const readField = (key: string): string => {
    if (device === "desktop") return val(key);
    const v = activeBucket?.[key];
    return typeof v === "string" ? v : "";
  };

  const writeField = (key: string, next: string) => {
    if (device === "desktop") {
      onPatch({ [key]: next || undefined });
      return;
    }
    onDeepPatch?.({
      breakpoints: {
        [device]: {
          [key]: next || undefined,
        },
      },
    });
  };

  const containerOpts = PRESENTATION_OPTIONS.containerWidth;
  const padOpts = PRESENTATION_OPTIONS.paddingTop;

  return (
    <InspectorSection title="Responsive settings">
      <InspectorViewportRail
        device={device}
        onDeviceChange={onDeviceChange}
        hideOnDevice={hideOnDevice}
        onHideChange={onHideChange}
        overrideCount={overrideCount}
        onResetOverrides={onResetOverrides}
        compact
      />
      <InspectorField
        label={PRESENTATION_FIELD_LABELS.containerWidth}
        overrideDevice={getPresentationOverrideDevice(presentation, "containerWidth")}
      >
        <InspectorSelect
          value={readField("containerWidth")}
          onChange={(e) => writeField("containerWidth", e.target.value)}
        >
          <option value="">Theme default</option>
          {containerOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </InspectorSelect>
      </InspectorField>
      {stackOrderPlaceholder ? (
        <InspectorField
          label="Stack order"
          help="Section-level stack order is desktop-only in v1."
        >
          <InspectorSelect disabled value="">
            <option value="">Default (0)</option>
          </InspectorSelect>
        </InspectorField>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <InspectorField
          label="Padding top"
          overrideDevice={getPresentationOverrideDevice(presentation, "paddingTop")}
        >
          <InspectorSelect
            value={readField("paddingTop")}
            onChange={(e) => writeField("paddingTop", e.target.value)}
          >
            <option value="">Theme default</option>
            {padOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {paddingLabel(o.value)}
              </option>
            ))}
          </InspectorSelect>
        </InspectorField>
        <InspectorField
          label="Padding bottom"
          overrideDevice={getPresentationOverrideDevice(presentation, "paddingBottom")}
        >
          <InspectorSelect
            value={readField("paddingBottom")}
            onChange={(e) => writeField("paddingBottom", e.target.value)}
          >
            <option value="">Theme default</option>
            {padOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {paddingLabel(o.value)}
              </option>
            ))}
          </InspectorSelect>
        </InspectorField>
      </div>
    </InspectorSection>
  );
}
