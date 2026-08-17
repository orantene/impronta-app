/**
 * StylePanel · SpacingSection domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held, so runtime behavior is identical — same
 * controls, same values, same tree mutation on edit.
 */

import { BoxModel } from "../../kit/box-model";
import { NumberUnit, formatLength } from "../../kit/number-unit";
import { CHROME } from "../../kit/tokens";
import { InspectorGroup } from "../kit";
import {
  GAP_PRESETS,
  PresetNumberRow,
  SPACING_PRESETS_SHIPPED,
  type FieldValue,
} from "../field-kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL, InspectorOverrideBadge } from "../kit/inspector-ui";
import { getStyleOverrideDevice } from "../responsive-field-state";
import { parseCssLength } from "./length-utils";
import {
  oneSlotFieldValue,
  oneSlotPatch,
  twoSlotFieldValue,
  twoSlotPatch,
} from "./field-value-bridge";
import { parseStyleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { StyleGroupOverrideDot, ThemeBindRow } from "./section-shared";
import type { StandaloneSectionCtx } from "./section-types";

export type SpacingSectionProps = Pick<
  StandaloneSectionCtx,
  "patchSelectedStandaloneStyle" | "selectedStandaloneFullStyle" | "selectedStandaloneStyleNode" | "selectedStandaloneViewportStyle" | "selectedViewport" | "setOrToggleStandaloneStyle" | "spacingHasResponsiveOverride"
>;

/**
 * The margin/padding token slots share one enum. Naming it once keeps the four
 * bridge call sites from each casting a slightly different union.
 */
type SpacingToken = "none" | "s" | "m" | "l" | undefined;

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
              // D5 — field-level search keywords (see InspectorGroup).
              searchTerms={[
                "margin",
                "padding",
                "gap",
                "box model",
                "inset",
              ]}
              accessory={
                spacingHasResponsiveOverride ? (
                  <StyleGroupOverrideDot label="Spacing has tablet/mobile overrides" />
                ) : null
              }
            >
            {/* ── D9: every chip carries its real px, and the exact input sits
                beside it. `marginTop` stores a token; `marginTopFree` stores a
                length; `field-value-bridge` owns which one a given edit writes
                and always clears the other. ─────────────────────────────── */}
            <PresetNumberRow
              dataControl="marginTop"
              label="Margin top"
              searchTerms={["Margin top", "space above", "outer spacing"]}
              presets={SPACING_PRESETS_SHIPPED}
              value={twoSlotFieldValue(
                selectedStandaloneViewportStyle?.marginTop,
                selectedStandaloneViewportStyle?.marginTopFree,
              )}
              onChange={(next) => {
                const patch = twoSlotPatch(next);
                patchSelectedStandaloneStyle({
                  marginTop: patch.token as SpacingToken,
                  marginTopFree: patch.free,
                });
              }}
              accessory={
                getStyleOverrideDevice(selectedStandaloneFullStyle, "marginTop") ? (
                  <InspectorOverrideBadge
                    device={getStyleOverrideDevice(selectedStandaloneFullStyle, "marginTop")!}
                    onReset={
                      selectedViewport !== "desktop"
                        ? () => patchSelectedStandaloneStyle({ marginTop: undefined })
                        : undefined
                    }
                  />
                ) : null
              }
            />
            <PresetNumberRow
              dataControl="marginBottom"
              label="Margin bottom"
              searchTerms={["Margin bottom", "space below", "outer spacing"]}
              presets={SPACING_PRESETS_SHIPPED}
              value={twoSlotFieldValue(
                selectedStandaloneViewportStyle?.marginBottom,
                selectedStandaloneViewportStyle?.marginBottomFree,
              )}
              onChange={(next) => {
                const patch = twoSlotPatch(next);
                patchSelectedStandaloneStyle({
                  marginBottom: patch.token as SpacingToken,
                  marginBottomFree: patch.free,
                });
              }}
              accessory={
                getStyleOverrideDevice(selectedStandaloneFullStyle, "marginBottom") ? (
                  <InspectorOverrideBadge
                    device={getStyleOverrideDevice(selectedStandaloneFullStyle, "marginBottom")!}
                    onReset={
                      selectedViewport !== "desktop"
                        ? () => patchSelectedStandaloneStyle({ marginBottom: undefined })
                        : undefined
                    }
                  />
                ) : null
              }
            />

            {["container", "split", "card", "cta_group", "button"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <>
                {/* Padding's free slot is the PAIR of sides, because the token
                    is an axis and the renderer has no `paddingXFree`. Writing
                    an exact value therefore sets both sides of that axis —
                    which is what the axis chip did too. */}
                <PresetNumberRow
                  dataControl="paddingX"
                  label="Padding X"
                  hint="Left and right inside the block."
                  searchTerms={["Padding X", "horizontal padding", "inner spacing", "side padding"]}
                  presets={SPACING_PRESETS_SHIPPED}
                  value={twoSlotFieldValue(
                    selectedStandaloneViewportStyle?.paddingX,
                    selectedStandaloneViewportStyle?.paddingLeft,
                  )}
                  onChange={(next) => {
                    const patch = twoSlotPatch(next);
                    patchSelectedStandaloneStyle({
                      paddingX: patch.token as SpacingToken,
                      paddingLeft: patch.free,
                      paddingRight: patch.free,
                    });
                  }}
                  accessory={
                    getStyleOverrideDevice(selectedStandaloneFullStyle, "paddingX") ? (
                      <InspectorOverrideBadge
                        device={getStyleOverrideDevice(selectedStandaloneFullStyle, "paddingX")!}
                        onReset={
                          selectedViewport !== "desktop"
                            ? () => patchSelectedStandaloneStyle({ paddingX: undefined })
                            : undefined
                        }
                      />
                    ) : null
                  }
                />
                <PresetNumberRow
                  dataControl="paddingY"
                  label="Padding Y"
                  hint="Top and bottom inside the block."
                  searchTerms={["Padding Y", "vertical padding", "inner spacing"]}
                  presets={SPACING_PRESETS_SHIPPED}
                  value={twoSlotFieldValue(
                    selectedStandaloneViewportStyle?.paddingY,
                    selectedStandaloneViewportStyle?.paddingTop,
                  )}
                  onChange={(next) => {
                    const patch = twoSlotPatch(next);
                    patchSelectedStandaloneStyle({
                      paddingY: patch.token as SpacingToken,
                      paddingTop: patch.free,
                      paddingBottom: patch.free,
                    });
                  }}
                  accessory={
                    getStyleOverrideDevice(selectedStandaloneFullStyle, "paddingY") ? (
                      <InspectorOverrideBadge
                        device={getStyleOverrideDevice(selectedStandaloneFullStyle, "paddingY")!}
                        onReset={
                          selectedViewport !== "desktop"
                            ? () => patchSelectedStandaloneStyle({ paddingY: undefined })
                            : undefined
                        }
                      />
                    ) : null
                  }
                />
              </>
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
                {/* Gap is a ONE-slot field: there is no `gapFree`, so the chips
                    are shortcuts into the same key. The bridge writes the
                    preset's own rem (never a px re-rounding) and re-lights the
                    chip by normalising rem→px, so the row cannot show a dark
                    chip beside the number it just wrote. */}
                {parseStyleTokenRef(selectedStandaloneViewportStyle?.gap) ? null : (
                  <PresetNumberRow
                    label="Gap"
                    searchTerms={["Gap", "space between", "gutter", "column gap"]}
                    presets={GAP_PRESETS}
                    placeholder="Linked"
                    value={oneSlotFieldValue(
                      selectedStandaloneViewportStyle?.gap,
                      GAP_PRESETS,
                    )}
                    onChange={(next: FieldValue) =>
                      patchSelectedStandaloneStyle({
                        gap: oneSlotPatch(next, GAP_PRESETS),
                      })
                    }
                  />
                )}
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
