/**
 * StylePanel · TypographySection domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held, so runtime behavior is identical — same
 * controls, same values, same tree mutation on edit.
 */

import { GoogleFontPicker } from "../../GoogleFontPicker";
import { NumberUnit, formatLength } from "../../kit/number-unit";
import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { InspectorGroup, SegmentedField } from "../kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL, InspectorOverrideBadge } from "../kit/inspector-ui";
import { getStyleOverrideDevice } from "../responsive-field-state";
import { parseCssLength } from "./length-utils";
import { ALIGN_OPTIONS, BUILDER_NODE_FONT_STYLE_OPTIONS, BUILDER_NODE_FONT_WEIGHT_OPTIONS, BUILDER_NODE_STYLE_SIZE_OPTIONS, BUILDER_NODE_TEXT_DECORATION_OPTIONS, BUILDER_NODE_TEXT_TRANSFORM_OPTIONS, BUILDER_NODE_TEXT_WRAP_OPTIONS, BUILDER_NODE_TONE_OPTIONS, BUILDER_NODE_WHITE_SPACE_OPTIONS } from "./style-options";
import { StyleGroupOverrideDot } from "./section-shared";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import type { StandaloneSectionCtx } from "./section-types";

export type TypographySectionProps = Pick<
  StandaloneSectionCtx,
  "nodeFontPickerOpen" | "patchSelectedStandaloneStyle" | "selectedStandaloneFullStyle" | "selectedStandaloneStyleNode" | "selectedStandaloneViewportStyle" | "selectedViewport" | "setNodeFontPickerOpen" | "setOrToggleStandaloneStyle" | "typographyHasResponsiveOverride"
>;

export function TypographySection({
  nodeFontPickerOpen,
  patchSelectedStandaloneStyle,
  selectedStandaloneFullStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  selectedViewport,
  setNodeFontPickerOpen,
  setOrToggleStandaloneStyle,
  typographyHasResponsiveOverride,
}: TypographySectionProps) {
  return (
            <InspectorGroup
              title="Typography"
              collapsible
              storageKey={`style-panel:typography:${selectedStandaloneStyleNode.kind}`}
              defaultOpen={["heading", "paragraph", "button", "rich_text"].includes(selectedStandaloneStyleNode.kind)}
            >
            {typographyHasResponsiveOverride ? (
              <div className="flex justify-end">
                <StyleGroupOverrideDot label="Typography has tablet/mobile overrides" />
              </div>
            ) : null}
            <SegmentedField
              dataControl="align"
              label="Align"
              accessory={getStyleOverrideDevice(selectedStandaloneFullStyle, "align") ? (
                <InspectorOverrideBadge
                  device={getStyleOverrideDevice(selectedStandaloneFullStyle, "align")!}
                  onReset={
                    selectedViewport !== "desktop"
                      ? () => patchSelectedStandaloneStyle({ align: undefined })
                      : undefined
                  }
                />
              ) : null}
              value={selectedStandaloneViewportStyle?.align ?? ""}
              onChange={(next) => setOrToggleStandaloneStyle("align", next)}
              options={ALIGN_OPTIONS}
            />

            {["heading", "paragraph", "button"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <SegmentedField
                dataControl="size"
                label="Size"
                accessory={getStyleOverrideDevice(selectedStandaloneFullStyle, "size") ? (
                  <InspectorOverrideBadge
                    device={getStyleOverrideDevice(selectedStandaloneFullStyle, "size")!}
                    onReset={
                      selectedViewport !== "desktop"
                        ? () => patchSelectedStandaloneStyle({ size: undefined })
                        : undefined
                    }
                  />
                ) : null}
                value={selectedStandaloneViewportStyle?.size ?? ""}
                onChange={(next) => setOrToggleStandaloneStyle("size", next)}
                options={BUILDER_NODE_STYLE_SIZE_OPTIONS}
              />
            ) : null}

            {["heading", "paragraph"].includes(selectedStandaloneStyleNode.kind) ? (
              <SegmentedField
                dataControl="tone"
                label="Tone"
                accessory={getStyleOverrideDevice(selectedStandaloneFullStyle, "tone") ? (
                  <InspectorOverrideBadge
                    device={getStyleOverrideDevice(selectedStandaloneFullStyle, "tone")!}
                    onReset={
                      selectedViewport !== "desktop"
                        ? () => patchSelectedStandaloneStyle({ tone: undefined })
                        : undefined
                    }
                  />
                ) : null}
                value={selectedStandaloneViewportStyle?.tone ?? ""}
                onChange={(next) => setOrToggleStandaloneStyle("tone", next)}
                options={BUILDER_NODE_TONE_OPTIONS}
              />
            ) : null}

            {["heading", "paragraph", "button"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div
                className="flex flex-col gap-2 border-t pt-3"
                data-builder-node-style-control="typography"
                style={{ borderColor: CHROME.line }}
              >
                <div className="flex items-end justify-between gap-2">
                  <span className={FIELD_LABEL}>Font</span>
                  <button
                    type="button"
                    data-builder-node-style-control="fontFamily-toggle"
                    onClick={() => setNodeFontPickerOpen((v) => !v)}
                    className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: CHROME.muted,
                      padding: 0,
                    }}
                  >
                    {nodeFontPickerOpen ? "Close" : "Change"}
                  </button>
                </div>
                <span
                  className="truncate text-[11px]"
                  style={{
                    color: selectedStandaloneViewportStyle?.fontFamily
                      ? CHROME.ink
                      : CHROME.muted2,
                    fontFamily:
                      selectedStandaloneViewportStyle?.fontFamily || undefined,
                  }}
                >
                  {selectedStandaloneViewportStyle?.fontFamily
                    ? selectedStandaloneViewportStyle.fontFamily
                        .split(",")[0]
                        .replace(/["']/g, "")
                    : "Theme default"}
                </span>
                {nodeFontPickerOpen ? (
                  <GoogleFontPicker
                    slot={
                      selectedStandaloneStyleNode.kind === "heading"
                        ? "heading"
                        : "body"
                    }
                    value={selectedStandaloneViewportStyle?.fontFamily ?? ""}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        fontFamily: next || undefined,
                      })
                    }
                  />
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="flex flex-col gap-1.5"
                    data-builder-node-style-control="fontSize"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={FIELD_LABEL}>Size</span>
                      {getStyleOverrideDevice(selectedStandaloneFullStyle, "fontSize") ? (
                        <InspectorOverrideBadge
                          device={getStyleOverrideDevice(selectedStandaloneFullStyle, "fontSize")!}
                          onReset={
                            selectedViewport !== "desktop"
                              ? () => patchSelectedStandaloneStyle({ fontSize: undefined })
                              : undefined
                          }
                        />
                      ) : null}
                    </div>
                    <NumberUnit
                      units={["px", "rem", "em"]}
                      defaultUnit="px"
                      placeholder="Theme"
                      value={parseCssLength(
                        selectedStandaloneViewportStyle?.fontSize,
                      )}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          fontSize: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                  <div
                    className="flex flex-col gap-1.5"
                    data-builder-node-style-control="lineHeight"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={FIELD_LABEL}>Line height</span>
                      {getStyleOverrideDevice(selectedStandaloneFullStyle, "lineHeight") ? (
                        <InspectorOverrideBadge
                          device={getStyleOverrideDevice(selectedStandaloneFullStyle, "lineHeight")!}
                          onReset={
                            selectedViewport !== "desktop"
                              ? () => patchSelectedStandaloneStyle({ lineHeight: undefined })
                              : undefined
                          }
                        />
                      ) : null}
                    </div>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      inputMode="decimal"
                      placeholder="Theme"
                      value={selectedStandaloneViewportStyle?.lineHeight ?? ""}
                      onChange={(e) =>
                        patchSelectedStandaloneStyle({
                          lineHeight: e.target.value.trim() || undefined,
                        })
                      }
                      className="px-2"
                      style={{
                        height: 30,
                        fontSize: 12,
                        background: CHROME.surface2,
                        border: `1px solid ${CHROME.controlBorder}`,
                        borderRadius: 7,
                        color: CHROME.ink,
                        outline: "none",
                      }}
                    />
                    {/* Tactile slider — only drives a unitless multiplier; leaves
                        the field empty (theme default) until dragged. */}
                    <input
                      type="range"
                      aria-label="Line height slider"
                      data-builder-node-style-slider="lineHeight"
                      min={0.8}
                      max={2.6}
                      step={0.05}
                      value={Number(selectedStandaloneViewportStyle?.lineHeight) || 1.5}
                      onChange={(e) =>
                        patchSelectedStandaloneStyle({ lineHeight: e.target.value })
                      }
                      style={{ width: "100%", accentColor: CHROME.ink, cursor: "pointer" }}
                    />
                  </div>
                </div>

                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="letterSpacing"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={FIELD_LABEL}>Letter spacing</span>
                    {getStyleOverrideDevice(selectedStandaloneFullStyle, "letterSpacing") ? (
                      <InspectorOverrideBadge
                        device={getStyleOverrideDevice(selectedStandaloneFullStyle, "letterSpacing")!}
                        onReset={
                          selectedViewport !== "desktop"
                            ? () => patchSelectedStandaloneStyle({ letterSpacing: undefined })
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                  <NumberUnit
                    units={["em", "px"]}
                    defaultUnit="em"
                    step={0.01}
                    placeholder="Theme"
                    value={parseCssLength(
                      selectedStandaloneViewportStyle?.letterSpacing,
                    )}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        letterSpacing: next ? formatLength(next) : undefined,
                      })
                    }
                  />
                  {/* Tactile slider in em (the common unit). Writes "<v>em"; a
                      0 value clears the override (back to theme). */}
                  <input
                    type="range"
                    aria-label="Letter spacing slider (em)"
                    data-builder-node-style-slider="letterSpacing"
                    min={-0.05}
                    max={0.4}
                    step={0.005}
                    value={(() => {
                      const p = parseCssLength(
                        selectedStandaloneViewportStyle?.letterSpacing,
                      );
                      return p && p.unit === "em" ? p.value : 0;
                    })()}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      patchSelectedStandaloneStyle({
                        letterSpacing: v === 0 ? undefined : `${v}em`,
                      });
                    }}
                    style={{ width: "100%", accentColor: CHROME.ink, cursor: "pointer" }}
                  />
                </div>

                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="fontWeight"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={FIELD_LABEL}>Weight</span>
                    {getStyleOverrideDevice(selectedStandaloneFullStyle, "fontWeight") ? (
                      <InspectorOverrideBadge
                        device={getStyleOverrideDevice(selectedStandaloneFullStyle, "fontWeight")!}
                        onReset={
                          selectedViewport !== "desktop"
                            ? () => patchSelectedStandaloneStyle({ fontWeight: undefined })
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                  <Segmented
                    fullWidth
                    compact
                    value={
                      selectedStandaloneViewportStyle?.fontWeight
                        ? String(selectedStandaloneViewportStyle.fontWeight)
                        : ""
                    }
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        fontWeight: next ? Number(next) : undefined,
                      })
                    }
                    options={BUILDER_NODE_FONT_WEIGHT_OPTIONS}
                  />
                </div>

                <details
                  open={Boolean(
                    selectedStandaloneViewportStyle?.textTransform ||
                      selectedStandaloneViewportStyle?.fontStyle ||
                      selectedStandaloneViewportStyle?.textDecoration ||
                      selectedStandaloneViewportStyle?.textWrap ||
                      selectedStandaloneViewportStyle?.whiteSpace ||
                      selectedStandaloneViewportStyle?.lineClamp,
                  )}
                >
                  <summary
                    className="flex items-center justify-between select-none"
                    style={{ cursor: "pointer", outline: "none", listStyle: "none" }}
                  >
                    <span className={FIELD_LABEL}>More text options</span>
                    <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="textTransform"
                >
                  <span className={FIELD_LABEL}>Transform</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.textTransform ?? ""}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        textTransform:
                          (next || undefined) as BuilderNodeStyleValue["textTransform"],
                      })
                    }
                    options={BUILDER_NODE_TEXT_TRANSFORM_OPTIONS}
                  />
                </div>

                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="fontStyle"
                >
                  <span className={FIELD_LABEL}>Style</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.fontStyle ?? ""}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        fontStyle:
                          (next || undefined) as BuilderNodeStyleValue["fontStyle"],
                      })
                    }
                    options={BUILDER_NODE_FONT_STYLE_OPTIONS}
                  />
                </div>

                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="textDecoration"
                >
                  <span className={FIELD_LABEL}>Decoration</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.textDecoration ?? ""}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        textDecoration:
                          (next || undefined) as BuilderNodeStyleValue["textDecoration"],
                      })
                    }
                    options={BUILDER_NODE_TEXT_DECORATION_OPTIONS}
                  />
                </div>

                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="textWrap"
                >
                  <span className={FIELD_LABEL}>Text wrap</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.textWrap ?? ""}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        textWrap:
                          (next || undefined) as BuilderNodeStyleValue["textWrap"],
                      })
                    }
                    options={BUILDER_NODE_TEXT_WRAP_OPTIONS}
                  />
                </div>

                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="whiteSpace"
                >
                  <span className={FIELD_LABEL}>Whitespace</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.whiteSpace ?? ""}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        whiteSpace:
                          (next || undefined) as BuilderNodeStyleValue["whiteSpace"],
                      })
                    }
                    options={BUILDER_NODE_WHITE_SPACE_OPTIONS}
                  />
                </div>

                <div
                  className="flex flex-col gap-1.5"
                  data-builder-node-style-control="lineClamp"
                >
                  <span className={FIELD_LABEL}>Truncate to lines</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    placeholder="Off"
                    className="px-2"
                    style={{
                      height: 30,
                      width: "100%",
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    value={
                      typeof selectedStandaloneViewportStyle?.lineClamp ===
                      "number"
                        ? selectedStandaloneViewportStyle.lineClamp
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.currentTarget.value.trim();
                      const n = raw ? Math.round(Number(raw)) : NaN;
                      patchSelectedStandaloneStyle({
                        lineClamp:
                          Number.isFinite(n) && n >= 1 ? n : undefined,
                      });
                    }}
                  />
                </div>
                  </div>
                </details>
              </div>
            ) : null}
            </InspectorGroup>
  );
}
