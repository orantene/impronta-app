/**
 * StylePanel · SpacingSection domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held, so runtime behavior is identical — same
 * controls, same values, same tree mutation on edit.
 */

import { BoxModel } from "../../kit/box-model";
import { CHROME } from "../../kit/tokens";
import {
  GAP_PRESETS,
  PresetNumberRow,
  SPACING_PRESETS_SHIPPED,
  type FieldValue,
} from "../field-kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL, InspectorOverrideBadge } from "../kit/inspector-ui";
import { getStyleOverrideDevice } from "../responsive-field-state";
import { parseCssLength } from "./length-utils";
import { MarginSidesGroup, PaddingSidesGroup } from "./exact-spacing-sides";
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

/**
 * D4 — the spacing half of the "Layout & spacing" group's BODY. This component
 * used to own a "Spacing" accordion of its own; the mockup folds size and
 * spacing into ONE group, so the wrapper moved to
 * `groups/LayoutSpacingGroup.tsx`. The override dot it used to hand the
 * accordion header as an `accessory` now renders inline at the top of the
 * spacing fields, so the merged group's header is not claimed by one half.
 */
export function SpacingBody({
  patchSelectedStandaloneStyle,
  selectedStandaloneFullStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  selectedViewport,
  setOrToggleStandaloneStyle,
  spacingHasResponsiveOverride,
}: SpacingSectionProps) {
  return (
            <>
            {spacingHasResponsiveOverride ? (
              <div className="flex justify-end">
                <StyleGroupOverrideDot label="Spacing has tablet/mobile overrides" />
              </div>
            ) : null}
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

            {/* D4 — "Fine-tune spacing" WAS a grey <details> summary styled
                exactly like every static field label beside it: the only way
                to learn that per-side padding existed was to click a label
                that gave no sign it was clickable. The disclosure is gone; the
                fields render plainly. Nothing was removed — every control
                below is the one that was inside it. (One of the three
                label-disguised disclosures #1199 flagged.) */}
            {!["divider", "spacer"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div
                className="border-t pt-3 flex flex-col gap-2"
                data-builder-node-style-control="fineSpacing"
                style={{ borderColor: CHROME.line }}
              >
                  <div className="flex flex-col gap-2">
            {!["divider", "spacer"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <>
                {/* The eight per-side fields. They lead with the renderer's own
                    spacing scale (`ScaleStepper`) and keep every exact number
                    one level down behind "Exact values" — which opens itself
                    when a side already holds a length the scale does not own,
                    so an existing hand-authored design shows its real numbers
                    instead of a step name nobody chose. */}
                <PaddingSidesGroup
                  patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
                  selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
                />
                <MarginSidesGroup
                  patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
                  selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
                />
              </>
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

            {/* Box-model diagram for freeform spacing — visual shortcut.
                D4 — "Box model" WAS the second label-disguised disclosure in
                this file: a grey <details> summary indistinguishable from a
                field label. The diagram is the fastest way to read and edit
                all eight sides at once, so it renders. */}
            {!["divider", "spacer"].includes(selectedStandaloneStyleNode.kind) ? (
              <div data-builder-node-style-control="box-model">
                  <span className={FIELD_LABEL}>Box model</span>
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
              </div>
            ) : null}
                  </div>
              </div>
            ) : null}
            </>
  );
}
