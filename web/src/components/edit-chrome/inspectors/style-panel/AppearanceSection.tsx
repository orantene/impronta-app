/**
 * StylePanel · AppearanceSection domain sub-section (W5-C1).
 *
 * Carved verbatim from style-panel.tsx's render body. Receives the exact
 * closure values the parent held, so runtime behavior is identical — same
 * controls, same values, same tree mutation on edit.
 */

import { ColorPickerPopover } from "../../kit/color-picker";
import { NumberUnit, formatLength } from "../../kit/number-unit";
import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { InspectorGroup, SegmentedField } from "../kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import { inspectorColorSwatchStyle } from "../style-panel-state-style-fields";
import { parseCssLength } from "./length-utils";
import { BUILDER_NODE_BACKGROUND_OPTIONS, BUILDER_NODE_BORDER_STYLE_OPTIONS, BUILDER_NODE_RADIUS_OPTIONS } from "./style-options";
import { parseStyleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { BUILDER_NODE_THEME_COLOR_TOKENS, ThemeBindRow, colorSwatchDisplay } from "./section-shared";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import type { StandaloneSectionCtx } from "./section-types";

export type AppearanceSectionProps = Pick<
  StandaloneSectionCtx,
  "nodeColorField" | "patchSelectedStandaloneStyle" | "selectedStandaloneStyleNode" | "selectedStandaloneViewportStyle" | "setNodeColorField" | "setOrToggleStandaloneStyle"
>;

export function AppearanceSection({
  nodeColorField,
  patchSelectedStandaloneStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  setNodeColorField,
  setOrToggleStandaloneStyle,
}: AppearanceSectionProps) {
  return (
            <InspectorGroup
              title="Appearance"
              collapsible
              storageKey={`style-panel:appearance:${selectedStandaloneStyleNode.kind}`}
              // Cold-cost fix (2026-08-15): open the group RELEVANT to the
              // selection instead of landing everything collapsed. For surface
              // kinds (fill / corners live here) Appearance is the money
              // group, mirroring how Typography already default-opens for
              // text kinds. Text-first kinds keep it collapsed. The
              // sessionStorage entry (per kind) still wins once the operator
              // toggles it themselves.
              defaultOpen={["container", "split", "card", "cta_group", "image"].includes(
                selectedStandaloneStyleNode.kind,
              )}
              // D5 — field-level search keywords (see InspectorGroup).
              searchTerms={[
                "background",
                "fill",
                "color",
                "text color",
                "border",
                "corners",
                "radius",
                "rounded",
              ]}
            >
            {["container", "split", "card", "cta_group"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <SegmentedField
                dataControl="background"
                label="Background"
                value={selectedStandaloneViewportStyle?.background ?? ""}
                onChange={(next) => setOrToggleStandaloneStyle("background", next)}
                options={BUILDER_NODE_BACKGROUND_OPTIONS}
              />
            ) : null}

            {["container", "split", "card", "cta_group", "button", "image"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="radius">
                <span className={FIELD_LABEL}>Corners</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.radius ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("radius", next)}
                  options={BUILDER_NODE_RADIUS_OPTIONS}
                />
                {parseStyleTokenRef(selectedStandaloneViewportStyle?.borderRadius) ? null : (
                  <div
                    className="flex items-center justify-between gap-2"
                    data-builder-node-style-control="radiusFree"
                  >
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Exact
                    </span>
                    <NumberUnit
                      units={["px", "rem", "%"]}
                      defaultUnit="px"
                      placeholder="Linked"
                      value={parseCssLength(selectedStandaloneViewportStyle?.borderRadius)}
                      onChange={(next) =>
                        patchSelectedStandaloneStyle({
                          borderRadius: next ? formatLength(next) : undefined,
                        })
                      }
                    />
                  </div>
                )}
                <ThemeBindRow
                  prop="borderRadius"
                  value={selectedStandaloneViewportStyle?.borderRadius}
                  onSet={(sentinel) =>
                    patchSelectedStandaloneStyle({ borderRadius: sentinel })
                  }
                  onDetach={() =>
                    patchSelectedStandaloneStyle({ borderRadius: undefined })
                  }
                />
              </div>
            ) : null}

            {!["divider", "spacer"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div
                className="flex flex-col gap-2 border-t pt-3"
                data-builder-node-style-control="color"
                style={{ borderColor: CHROME.line }}
              >
                <span className={FIELD_LABEL}>Color &amp; border</span>

                {["heading", "paragraph", "button"].includes(
                  selectedStandaloneStyleNode.kind,
                ) ? (
                  <div
                    className="flex items-center justify-between gap-2"
                    data-builder-node-style-control="textColor"
                  >
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Text
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedStandaloneViewportStyle?.textColor ? (
                        <button
                          type="button"
                          onClick={() =>
                            patchSelectedStandaloneStyle({ textColor: undefined })
                          }
                          className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: CHROME.muted,
                            padding: 0,
                          }}
                        >
                          Clear
                        </button>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Pick text color"
                        onClick={(e) => {
                          const btn = e.currentTarget;
                          setNodeColorField((prev) =>
                            prev?.field === "textColor"
                              ? null
                              : { field: "textColor", anchor: btn },
                          );
                        }}
                        className="cursor-pointer"
                        style={inspectorColorSwatchStyle(
                          Boolean(selectedStandaloneViewportStyle?.textColor),
                          colorSwatchDisplay(
                            selectedStandaloneViewportStyle?.textColor,
                          ),
                          { border: `1px solid ${CHROME.lineMid}` },
                        )}
                      />
                    </div>
                  </div>
                ) : null}

                {["container", "split", "card", "cta_group", "button"].includes(
                  selectedStandaloneStyleNode.kind,
                ) ? (
                  <div
                    className="flex items-center justify-between gap-2"
                    data-builder-node-style-control="backgroundColor"
                  >
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Fill
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedStandaloneViewportStyle?.backgroundColor ? (
                        <button
                          type="button"
                          onClick={() =>
                            patchSelectedStandaloneStyle({
                              backgroundColor: undefined,
                            })
                          }
                          className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: CHROME.muted,
                            padding: 0,
                          }}
                        >
                          Clear
                        </button>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Pick fill color"
                        onClick={(e) => {
                          const btn = e.currentTarget;
                          setNodeColorField((prev) =>
                            prev?.field === "backgroundColor"
                              ? null
                              : { field: "backgroundColor", anchor: btn },
                          );
                        }}
                        className="cursor-pointer"
                        style={inspectorColorSwatchStyle(
                          Boolean(selectedStandaloneViewportStyle?.backgroundColor),
                          colorSwatchDisplay(
                            selectedStandaloneViewportStyle?.backgroundColor,
                          ),
                          { border: `1px solid ${CHROME.lineMid}` },
                        )}
                      />
                    </div>
                  </div>
                ) : null}

                {["container", "split", "card", "cta_group", "button", "image"].includes(
                  selectedStandaloneStyleNode.kind,
                ) ? (
                  <div
                    className="flex flex-col gap-1.5"
                    data-builder-node-style-control="border"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px]" style={{ color: CHROME.muted }}>
                        Border
                      </span>
                      <div className="flex items-center gap-2">
                        {selectedStandaloneViewportStyle?.borderColor ? (
                          <button
                            type="button"
                            onClick={() =>
                              patchSelectedStandaloneStyle({
                                borderColor: undefined,
                              })
                            }
                            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: CHROME.muted,
                              padding: 0,
                            }}
                          >
                            Clear
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label="Pick border color"
                          onClick={(e) => {
                            const btn = e.currentTarget;
                            setNodeColorField((prev) =>
                              prev?.field === "borderColor"
                                ? null
                                : { field: "borderColor", anchor: btn },
                            );
                          }}
                          className="cursor-pointer"
                          style={inspectorColorSwatchStyle(
                            Boolean(selectedStandaloneViewportStyle?.borderColor),
                            colorSwatchDisplay(
                              selectedStandaloneViewportStyle?.borderColor,
                            ),
                            { border: `1px solid ${CHROME.lineMid}` },
                          )}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberUnit
                        units={["px"]}
                        defaultUnit="px"
                        placeholder="Width"
                        min={0}
                        value={parseCssLength(
                          selectedStandaloneViewportStyle?.borderWidth,
                        )}
                        onChange={(next) =>
                          patchSelectedStandaloneStyle({
                            borderWidth: next ? formatLength(next) : undefined,
                          })
                        }
                      />
                      <Segmented
                        fullWidth
                        compact
                        value={selectedStandaloneViewportStyle?.borderStyle ?? ""}
                        onChange={(next) =>
                          patchSelectedStandaloneStyle({
                            borderStyle:
                              (next || undefined) as BuilderNodeStyleValue["borderStyle"],
                          })
                        }
                        options={BUILDER_NODE_BORDER_STYLE_OPTIONS}
                      />
                    </div>
                  </div>
                ) : null}

                <ColorPickerPopover
                  open={nodeColorField !== null}
                  anchor={nodeColorField?.anchor ?? null}
                  value={
                    (nodeColorField
                      ? selectedStandaloneViewportStyle?.[nodeColorField.field]
                      : undefined) || "#111111"
                  }
                  onChange={(next) => {
                    if (!nodeColorField) return;
                    patchSelectedStandaloneStyle({
                      [nodeColorField.field]: next,
                    } as Partial<BuilderNodeStyleValue>);
                  }}
                  themeTokens={BUILDER_NODE_THEME_COLOR_TOKENS}
                  onClose={() => setNodeColorField(null)}
                />
              </div>
            ) : null}
            </InspectorGroup>
  );
}
