"use client";

/**
 * Mockup-faithful default Style tab for section-level selection (no node picked).
 */

import { useMemo, useState } from "react";

import type { NodePresentation } from "@/lib/site-admin/sections/shared/node-presentation";
import {
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
} from "@/lib/site-admin/sections/shared/presentation";
import { ColorPickerPopover } from "../kit/color-picker";
import { GoogleFontPicker } from "../GoogleFontPicker";
import { NumberUnit } from "../kit/number-unit";
import { Segmented } from "../kit/segmented";
import { Swatch } from "../kit/swatch";
import { CHROME } from "../kit/tokens";
import { useEditContext } from "../edit-context";
import {
  InspectorAccordion,
  InspectorField,
  InspectorSection,
  InspectorSelect,
} from "./kit";
import {
  InspectorColorHexInput,
  InspectorColorHexPair,
  InspectorColorSwatchRow,
  InspectorPlaceholderField,
  InspectorTypographyRow,
} from "./kit/inspector-mockup-primitives";
import {
  getNodePresentationOverrideDevice,
  getPresentationOverrideDevice,
} from "./responsive-field-state";

const BACKGROUND_SWATCHES: Record<string, { color: string }> = {
  canvas: { color: "linear-gradient(135deg, #ffffff 0%, #f4efe6 50%, #ffffff 100%)" },
  ivory: { color: "#fbf7ee" },
  champagne: { color: "#ecdcb8" },
  espresso: { color: "#2a201a" },
  blush: { color: "#f3d7d2" },
  sage: { color: "#c5d2bd" },
  "muted-surface": { color: "#ebe6dc" },
};

const QUICK_STYLE_OPTIONS = [
  { value: "", label: "Default (Clean)" },
  { value: "editorial", label: "Editorial" },
  { value: "bold", label: "Bold contrast" },
  { value: "soft", label: "Soft minimal" },
];

const COLOR_SWATCHES = [
  { key: "text", label: "Text", fallback: "#111111" },
  { key: "muted", label: "Muted", fallback: "#6B7280" },
  { key: "primary", label: "Primary", fallback: "#7C3AED" },
  { key: "link", label: "Link", fallback: "#6D28D9" },
] as const;

function rolePresentation(
  nodePresentation: Record<string, NodePresentation> | undefined,
  role: string,
): NodePresentation | undefined {
  return nodePresentation?.[role];
}

export interface SectionStyleMockupPanelProps {
  sectionTypeKey: string;
  draftProps: Record<string, unknown>;
  presentation: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  onPresentationPatch: (patch: Record<string, unknown>) => void;
  onNodePresentationPatch: (
    role: string,
    patch: Partial<NodePresentation>,
  ) => void;
  backgroundValue: string;
  backgroundColorCustom: string;
  moodValue: string;
  onSetBackground: (value: string) => void;
  onSetBackgroundCustom: (value: string | undefined) => void;
  onSetMood: (value: string) => void;
}

export function SectionStyleMockupPanel({
  draftProps,
  presentation,
  onPatch,
  onPresentationPatch,
  onNodePresentationPatch,
  backgroundValue,
  backgroundColorCustom,
  moodValue,
  onSetBackground,
  onSetBackgroundCustom,
  onSetMood,
}: SectionStyleMockupPanelProps) {
  const { device } = useEditContext();
  const nonDesktop = device !== "desktop";
  const nodePresentation =
    draftProps.nodePresentation && typeof draftProps.nodePresentation === "object"
      ? (draftProps.nodePresentation as Record<string, NodePresentation>)
      : undefined;

  const heading = rolePresentation(nodePresentation, "headline");
  const body = rolePresentation(nodePresentation, "subheadline") ??
    rolePresentation(nodePresentation, "copy");

  const [colorOpen, setColorOpen] = useState(false);
  const [activeColorKey, setActiveColorKey] = useState<
    (typeof COLOR_SWATCHES)[number]["key"] | null
  >(null);

  const paddingTopOverride = getPresentationOverrideDevice(presentation, "paddingTop");
  const visibilityOverride = getPresentationOverrideDevice(presentation, "visibility");

  const colorValues = useMemo(
    () => ({
      text: heading?.textColor ?? "#111111",
      muted: body?.textColor ?? "#6B7280",
      primary: (presentation.primaryAccent as string | undefined) ?? "#7C3AED",
      link: heading?.textColor ?? "#6D28D9",
    }),
    [body?.textColor, heading?.textColor, presentation.primaryAccent],
  );

  return (
    <>
      <InspectorSection
        title="Quick Styles"
        description="Apply a prebuilt visual style to this section."
      >
        <InspectorSelect
          value={moodValue || ""}
          onChange={(e) => onSetMood(e.target.value)}
          aria-label="Quick style preset"
        >
          {QUICK_STYLE_OPTIONS.map((opt) => (
            <option key={opt.value || "default"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </InspectorSelect>
      </InspectorSection>

      <InspectorSection title="Typography">
        {nonDesktop ? (
          <>
            <InspectorPlaceholderField label="Heading" message="Desktop only" />
            <InspectorPlaceholderField label="Body" message="Desktop only" />
          </>
        ) : (
          <>
            <InspectorTypographyRow
              title="Heading"
              overrideDevice={getNodePresentationOverrideDevice(
                heading as Record<string, unknown> | undefined,
                "fontSizePx",
              )}
              fontFamily={
                <GoogleFontPicker
                  slot="heading"
                  value={heading?.fontFamily ?? ""}
                  onChange={(next) =>
                    onNodePresentationPatch("headline", {
                      fontFamily: next || undefined,
                    })
                  }
                />
              }
              fontWeight={
                <InspectorSelect
                  value={String(heading?.fontWeight ?? "700")}
                  onChange={(e) =>
                    onNodePresentationPatch("headline", {
                      fontWeight: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  aria-label="Heading weight"
                >
                  {["400", "500", "600", "700", "800"].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </InspectorSelect>
              }
              fontSize={
                <NumberUnit
                  units={["px"]}
                  defaultUnit="px"
                  min={8}
                  max={240}
                  placeholder="56"
                  value={
                    heading?.fontSizePx
                      ? { value: heading.fontSizePx, unit: "px" }
                      : null
                  }
                  onChange={(next) =>
                    onNodePresentationPatch("headline", {
                      fontSizePx: next ? Math.round(next.value) : undefined,
                    })
                  }
                />
              }
            />
            <InspectorTypographyRow
              title="Body"
              overrideDevice={getNodePresentationOverrideDevice(
                body as Record<string, unknown> | undefined,
                "fontSizePx",
              )}
              fontFamily={
                <GoogleFontPicker
                  slot="body"
                  value={body?.fontFamily ?? ""}
                  onChange={(next) => {
                    const role = nodePresentation?.subheadline ? "subheadline" : "copy";
                    onNodePresentationPatch(role, {
                      fontFamily: next || undefined,
                    });
                  }}
                />
              }
              fontWeight={
                <InspectorSelect
                  value={String(body?.fontWeight ?? "400")}
                  onChange={(e) => {
                    const role = nodePresentation?.subheadline ? "subheadline" : "copy";
                    onNodePresentationPatch(role, {
                      fontWeight: e.target.value ? Number(e.target.value) : undefined,
                    });
                  }}
                  aria-label="Body weight"
                >
                  {["400", "500", "600", "700"].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </InspectorSelect>
              }
              fontSize={
                <NumberUnit
                  units={["px"]}
                  defaultUnit="px"
                  min={8}
                  max={120}
                  placeholder="16"
                  value={
                    body?.fontSizePx
                      ? { value: body.fontSizePx, unit: "px" }
                      : null
                  }
                  onChange={(next) => {
                    const role = nodePresentation?.subheadline ? "subheadline" : "copy";
                    onNodePresentationPatch(role, {
                      fontSizePx: next ? Math.round(next.value) : undefined,
                    });
                  }}
                />
              }
            />
          </>
        )}
      </InspectorSection>

      <InspectorSection title="Colors">
        {nonDesktop ? (
          <InspectorPlaceholderField message="Same as desktop" value="Uses desktop colors" />
        ) : (
          <InspectorColorSwatchRow
            items={COLOR_SWATCHES.map(({ key, label, fallback }) => ({
              key,
              label,
              color: colorValues[key] || fallback,
              onClick: () => {
                setActiveColorKey(key);
                setColorOpen(true);
              },
            }))}
          />
        )}
      </InspectorSection>

      <InspectorSection title="Background & Surface">
        <InspectorColorHexPair
          background={
            <InspectorColorHexInput
              value={backgroundColorCustom || "#FFFFFF"}
              onChange={(next) => onSetBackgroundCustom(next || undefined)}
            />
          }
          surface={
            <InspectorColorHexInput value="#F7F8FA" onChange={() => {}} />
          }
        />
        <InspectorField label={PRESENTATION_FIELD_LABELS.background}>
          <div
            className="grid items-center gap-2.5"
            style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
          >
            {PRESENTATION_OPTIONS.background.map((opt) => {
              const swatch = BACKGROUND_SWATCHES[opt.value];
              return (
                <Swatch
                  key={opt.value}
                  color={swatch?.color ?? "#ffffff"}
                  active={backgroundValue === opt.value}
                  onClick={() => onSetBackground(opt.value)}
                  size={28}
                  title={opt.label}
                />
              );
            })}
          </div>
        </InspectorField>
      </InspectorSection>

      <InspectorAccordion title="Spacing" defaultOpen={false}>
        {nonDesktop ? (
          <InspectorPlaceholderField message="Same as desktop" />
        ) : (
          <>
            <InspectorField
              label="Padding top"
              overrideDevice={paddingTopOverride}
            >
              <Segmented
                fullWidth
                compact
                value={(presentation.paddingTop as string | undefined) ?? ""}
                onChange={(next) =>
                  onPresentationPatch({ paddingTop: next || undefined })
                }
                options={PRESENTATION_OPTIONS.paddingTop}
              />
            </InspectorField>
            <InspectorField label="Padding bottom">
              <Segmented
                fullWidth
                compact
                value={(presentation.paddingBottom as string | undefined) ?? ""}
                onChange={(next) =>
                  onPresentationPatch({ paddingBottom: next || undefined })
                }
                options={PRESENTATION_OPTIONS.paddingBottom}
              />
            </InspectorField>
          </>
        )}
      </InspectorAccordion>

      <InspectorAccordion title="Visibility" defaultOpen={false}>
        {nonDesktop ? (
          <InspectorPlaceholderField message="Same as desktop" />
        ) : (
          <InspectorField
            label="Section visibility"
            overrideDevice={visibilityOverride}
          >
            <Segmented
              fullWidth
              compact
              value={(presentation.visibility as string | undefined) ?? ""}
              onChange={(next) =>
                onPresentationPatch({ visibility: next || undefined })
              }
              options={[
                { value: "", label: "Visible" },
                { value: "hidden", label: "Hidden" },
              ]}
            />
          </InspectorField>
        )}
      </InspectorAccordion>

      <InspectorAccordion title="Reuse Style" defaultOpen={false}>
        <InspectorPlaceholderField
          message="Desktop only"
          value="Copy / paste style from the selected block toolbar or node inspector."
        />
      </InspectorAccordion>

      <ColorPickerPopover
        open={colorOpen && activeColorKey !== null}
        anchor={null}
        value={
          activeColorKey ? colorValues[activeColorKey] : "#111111"
        }
        onChange={(next) => {
          if (!activeColorKey) return;
          if (activeColorKey === "text") {
            onNodePresentationPatch("headline", { textColor: next });
          } else if (activeColorKey === "muted") {
            const role = nodePresentation?.subheadline ? "subheadline" : "copy";
            onNodePresentationPatch(role, { textColor: next });
          } else if (activeColorKey === "primary") {
            onPresentationPatch({ primaryAccent: next });
          }
        }}
        onClose={() => {
          setColorOpen(false);
          setActiveColorKey(null);
        }}
      />
    </>
  );
}
