/**
 * StylePanel · SpacingSection domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held, so runtime behavior is identical — same
 * controls, same values, same tree mutation on edit.
 */

import { BoxModel } from "../../kit/box-model";
import { NumberUnit, formatLength } from "../../kit/number-unit";
import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { InspectorGroup } from "../kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL, InspectorOverrideBadge } from "../kit/inspector-ui";
import { getStyleOverrideDevice } from "../responsive-field-state";
import { parseCssLength } from "./length-utils";
import { BUILDER_NODE_SPACING_OPTIONS } from "./style-options";
import { parseStyleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { StyleGroupOverrideDot, ThemeBindRow } from "./section-shared";
import type { StandaloneSectionCtx } from "./section-types";

export type SpacingSectionProps = Pick<
  StandaloneSectionCtx,
  "patchSelectedStandaloneStyle" | "selectedStandaloneFullStyle" | "selectedStandaloneStyleNode" | "selectedStandaloneViewportStyle" | "selectedViewport" | "setOrToggleStandaloneStyle" | "spacingHasResponsiveOverride"
>;

export function SpacingSection({
  patchSelectedStandaloneStyle,
  selectedStandaloneFullStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  selectedViewport,
  setOrToggleStandaloneStyle,
  spacingHasResponsiveOverride,
}: SpacingSectionProps) {
  return (
            <InspectorGroup
              title="Spacing"
              collapsible
              storageKey={`style-panel:spacing:${selectedStandaloneStyleNode.kind}`}
              defaultOpen={false}
              accessory={
                spacingHasResponsiveOverride ? (
                  <StyleGroupOverrideDot label="Spacing has tablet/mobile overrides" />
                ) : null
              }
            >
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="marginTop">
                <div className="flex items-center justify-between gap-1">
                  <span className={FIELD_LABEL}>Margin top</span>
                  {getStyleOverrideDevice(selectedStandaloneFullStyle, "marginTop") ? (
                    <InspectorOverrideBadge
                      device={getStyleOverrideDevice(selectedStandaloneFullStyle, "marginTop")!}
                      onReset={
                        selectedViewport !== "desktop"
                          ? () => patchSelectedStandaloneStyle({ marginTop: undefined })
                          : undefined
                      }
                    />
                  ) : null}
                </div>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.marginTop ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("marginTop", next)}
                  options={BUILDER_NODE_SPACING_OPTIONS}
                />
              </div>
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="marginBottom">
                <div className="flex items-center justify-between gap-1">
                  <span className={FIELD_LABEL}>Bottom</span>
                  {getStyleOverrideDevice(selectedStandaloneFullStyle, "marginBottom") ? (
                    <InspectorOverrideBadge
                      device={getStyleOverrideDevice(selectedStandaloneFullStyle, "marginBottom")!}
                      onReset={
                        selectedViewport !== "desktop"
                          ? () => patchSelectedStandaloneStyle({ marginBottom: undefined })
                          : undefined
                      }
                    />
                  ) : null}
                </div>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.marginBottom ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("marginBottom", next)}
                  options={BUILDER_NODE_SPACING_OPTIONS}
                />
              </div>
            </div>

            {["container", "split", "card", "cta_group", "button"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5" data-builder-node-style-control="paddingX">
                  <div className="flex items-center justify-between gap-1">
                    <span className={FIELD_LABEL}>Padding X</span>
                    {getStyleOverrideDevice(selectedStandaloneFullStyle, "paddingX") ? (
                      <InspectorOverrideBadge
                        device={getStyleOverrideDevice(selectedStandaloneFullStyle, "paddingX")!}
                        onReset={
                          selectedViewport !== "desktop"
                            ? () => patchSelectedStandaloneStyle({ paddingX: undefined })
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.paddingX ?? ""}
                    onChange={(next) => setOrToggleStandaloneStyle("paddingX", next)}
                    options={BUILDER_NODE_SPACING_OPTIONS}
                  />
                </div>
                <div className="flex flex-col gap-1.5" data-builder-node-style-control="paddingY">
                  <div className="flex items-center justify-between gap-1">
                    <span className={FIELD_LABEL}>Padding Y</span>
                    {getStyleOverrideDevice(selectedStandaloneFullStyle, "paddingY") ? (
                      <InspectorOverrideBadge
                        device={getStyleOverrideDevice(selectedStandaloneFullStyle, "paddingY")!}
                        onReset={
                          selectedViewport !== "desktop"
                            ? () => patchSelectedStandaloneStyle({ paddingY: undefined })
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.paddingY ?? ""}
                    onChange={(next) => setOrToggleStandaloneStyle("paddingY", next)}
                    options={BUILDER_NODE_SPACING_OPTIONS}
                  />
                </div>
              </div>
            ) : null}

            {!["divider", "spacer"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div
                className="border-t pt-3"
                data-builder-node-style-control="fineSpacing"
                style={{ borderColor: CHROME.line }}
              >
                <details
                  open={Boolean(
                    selectedStandaloneViewportStyle?.paddingTop ||
                      selectedStandaloneViewportStyle?.paddingRight ||
                      selectedStandaloneViewportStyle?.paddingBottom ||
                      selectedStandaloneViewportStyle?.paddingLeft ||
                      selectedStandaloneViewportStyle?.marginTopFree ||
                      selectedStandaloneViewportStyle?.marginRightFree ||
                      selectedStandaloneViewportStyle?.marginBottomFree ||
                      selectedStandaloneViewportStyle?.marginLeftFree ||
                      selectedStandaloneViewportStyle?.gap,
                  )}
                >
                  <summary
                    className="flex items-center justify-between select-none"
                    style={{ cursor: "pointer", outline: "none", listStyle: "none" }}
                  >
                    <span className={FIELD_LABEL}>Fine-tune spacing</span>
                    <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
            {!["divider", "spacer"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div
                className="flex flex-col gap-2"
                data-builder-node-style-control="exactPadding"
              >
                <span className={FIELD_LABEL}>Exact padding</span>
                {/* Bind all four padding sides to the theme spacing rhythm in one
                    move (or detach back to raw). Reads/writes paddingTop as the
                    representative side; applies the same value to all sides. */}
                <ThemeBindRow
                  prop="paddingTop"
                  value={selectedStandaloneViewportStyle?.paddingTop}
                  onSet={(sentinel) =>
                    patchSelectedStandaloneStyle({
                      paddingTop: sentinel,
                      paddingRight: sentinel,
                      paddingBottom: sentinel,
                      paddingLeft: sentinel,
                    })
                  }
                  onDetach={() =>
                    patchSelectedStandaloneStyle({
                      paddingTop: undefined,
                      paddingRight: undefined,
                      paddingBottom: undefined,
                      paddingLeft: undefined,
                    })
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Top
                    </span>
                    <NumberUnit
                      units={["px", "%", "rem"]}
                      defaultUnit="px"
                      placeholder="Auto"
                      value={parseCssLength(selectedStandaloneViewportStyle?.paddingTop)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          paddingTop: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Right
                    </span>
                    <NumberUnit
                      units={["px", "%", "rem"]}
                      defaultUnit="px"
                      placeholder="Auto"
                      value={parseCssLength(selectedStandaloneViewportStyle?.paddingRight)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          paddingRight: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Bottom
                    </span>
                    <NumberUnit
                      units={["px", "%", "rem"]}
                      defaultUnit="px"
                      placeholder="Auto"
                      value={parseCssLength(selectedStandaloneViewportStyle?.paddingBottom)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          paddingBottom: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Left
                    </span>
                    <NumberUnit
                      units={["px", "%", "rem"]}
                      defaultUnit="px"
                      placeholder="Auto"
                      value={parseCssLength(selectedStandaloneViewportStyle?.paddingLeft)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          paddingLeft: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {!["divider", "spacer"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div
                className="flex flex-col gap-2"
                data-builder-node-style-control="exactMargin"
              >
                <span className={FIELD_LABEL}>Exact margin</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Top
                    </span>
                    <NumberUnit
                      units={["px", "%", "rem"]}
                      defaultUnit="px"
                      placeholder="Auto"
                      value={parseCssLength(selectedStandaloneViewportStyle?.marginTopFree)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          marginTopFree: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Right
                    </span>
                    <NumberUnit
                      units={["px", "%", "rem"]}
                      defaultUnit="px"
                      placeholder="Auto"
                      value={parseCssLength(selectedStandaloneViewportStyle?.marginRightFree)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          marginRightFree: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Bottom
                    </span>
                    <NumberUnit
                      units={["px", "%", "rem"]}
                      defaultUnit="px"
                      placeholder="Auto"
                      value={parseCssLength(selectedStandaloneViewportStyle?.marginBottomFree)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          marginBottomFree: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Left
                    </span>
                    <NumberUnit
                      units={["px", "%", "rem"]}
                      defaultUnit="px"
                      placeholder="Auto"
                      value={parseCssLength(selectedStandaloneViewportStyle?.marginLeftFree)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          marginLeftFree: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {["container", "split", "card", "cta_group", "carousel", "masonry"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div
                className="flex flex-col gap-1.5"
                data-builder-node-style-control="gap"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={FIELD_LABEL}>Gap</span>
                  {parseStyleTokenRef(selectedStandaloneViewportStyle?.gap) ? null : (
                    <NumberUnit
                      units={["px", "rem", "%"]}
                      defaultUnit="px"
                      placeholder="Linked"
                      value={parseCssLength(selectedStandaloneViewportStyle?.gap)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          gap: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  )}
                </div>
                <ThemeBindRow
                  prop="gap"
                  value={selectedStandaloneViewportStyle?.gap}
                  onSet={(sentinel) => patchSelectedStandaloneStyle({ gap: sentinel })}
                  onDetach={() => patchSelectedStandaloneStyle({ gap: undefined })}
                />
              </div>
            ) : null}

            {/* Box-model diagram for freeform spacing — visual shortcut */}
            {!["divider", "spacer"].includes(selectedStandaloneStyleNode.kind) ? (
              <div data-builder-node-style-control="box-model">
                <details>
                  <summary
                    className="flex items-center justify-between select-none"
                    style={{ cursor: "pointer", outline: "none", listStyle: "none" }}
                  >
                    <span className={FIELD_LABEL}>Box model</span>
                    <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                  </summary>
                  <div className="mt-2">
                    <BoxModel
                      margin={{
                        top: selectedStandaloneViewportStyle?.marginTopFree
                          ? (parseCssLength(selectedStandaloneViewportStyle.marginTopFree)?.value ?? null)
                          : null,
                        right: selectedStandaloneViewportStyle?.marginRightFree
                          ? (parseCssLength(selectedStandaloneViewportStyle.marginRightFree)?.value ?? null)
                          : null,
                        bottom: selectedStandaloneViewportStyle?.marginBottomFree
                          ? (parseCssLength(selectedStandaloneViewportStyle.marginBottomFree)?.value ?? null)
                          : null,
                        left: selectedStandaloneViewportStyle?.marginLeftFree
                          ? (parseCssLength(selectedStandaloneViewportStyle.marginLeftFree)?.value ?? null)
                          : null,
                      }}
                      padding={{
                        top: selectedStandaloneViewportStyle?.paddingTop
                          ? (parseCssLength(selectedStandaloneViewportStyle.paddingTop)?.value ?? null)
                          : null,
                        right: selectedStandaloneViewportStyle?.paddingRight
                          ? (parseCssLength(selectedStandaloneViewportStyle.paddingRight)?.value ?? null)
                          : null,
                        bottom: selectedStandaloneViewportStyle?.paddingBottom
                          ? (parseCssLength(selectedStandaloneViewportStyle.paddingBottom)?.value ?? null)
                          : null,
                        left: selectedStandaloneViewportStyle?.paddingLeft
                          ? (parseCssLength(selectedStandaloneViewportStyle.paddingLeft)?.value ?? null)
                          : null,
                      }}
                      maxMargin={200}
                      maxPadding={120}
                      onChangeMargin={(side, value) => {
                        const css = value != null ? `${value}px` : undefined;
                        if (side === "top") patchSelectedStandaloneStyle({ marginTopFree: css });
                        else if (side === "right") patchSelectedStandaloneStyle({ marginRightFree: css });
                        else if (side === "bottom") patchSelectedStandaloneStyle({ marginBottomFree: css });
                        else if (side === "left") patchSelectedStandaloneStyle({ marginLeftFree: css });
                      }}
                      onChangePadding={(side, value) => {
                        const css = value != null ? `${value}px` : undefined;
                        if (side === "top") patchSelectedStandaloneStyle({ paddingTop: css });
                        else if (side === "right") patchSelectedStandaloneStyle({ paddingRight: css });
                        else if (side === "bottom") patchSelectedStandaloneStyle({ paddingBottom: css });
                        else if (side === "left") patchSelectedStandaloneStyle({ paddingLeft: css });
                      }}
                    />
                  </div>
                </details>
              </div>
            ) : null}
                  </div>
                </details>
              </div>
            ) : null}
            </InspectorGroup>
  );
}
