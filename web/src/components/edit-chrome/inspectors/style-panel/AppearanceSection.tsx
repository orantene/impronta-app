/**
 * StylePanel · Appearance — REBUILT ON THE FIELD KIT (Inspector Reset, D9).
 *
 * This section is where the owner's amendment bites hardest, because it holds
 * the three properties that most obviously HAVE A LOOK:
 *
 *   Corners  — was a six-word `Segmented` ("Default Sharp S M L Pill") over a
 *              grey "Exact" row. Now four glyph tiles bent by the real radius,
 *              each captioned with its actual px, and the exact input beside
 *              them rather than under a second label.
 *   Border   — was a raw NumberUnit next to a four-word `Segmented`. Now a
 *              tile row of drawn rules (none / solid / dashed / dotted) and a
 *              second tile row of drawn WEIGHTS, each with its exact input.
 *   Fill     — the swatch rows keep their behaviour but move onto `FieldRow`,
 *              so their labels sit in the one label column instead of each
 *              inventing a width. That is the mockup's `.row`, and it is what
 *              fixes the ragged left edge in this section.
 *
 * WHAT DID NOT CHANGE: every write still routes through the exact same
 * `setOrToggleStandaloneStyle` / `patchSelectedStandaloneStyle` helpers, with
 * the same keys, and `ThemeBindRow` still guards the token-bound case. This is
 * a control-surface replacement, not a data-model change — the slot mapping is
 * `field-value-bridge.ts`, which is unit-tested separately.
 */

import { ColorPickerPopover } from "../../kit/color-picker";
import { NumberUnit, formatLength } from "../../kit/number-unit";
import { CHROME } from "../../kit/tokens";
import { SegmentedField } from "../kit";
import {
  BORDER_STYLE_PRESETS,
  BORDER_WIDTH_PRESETS,
  FieldRow,
  GlyphTiles,
  RADIUS_PRESETS,
  borderWeightTileOptions,
  lineStyleTileOptions,
  radiusTileOptions,
} from "../field-kit";
import { inspectorColorSwatchStyle } from "../style-panel-state-style-fields";
import { BorderSidesField, CornerRadiusField } from "./corner-border-sides-fields";
import { parseCssLength } from "./length-utils";
import { twoSlotFieldValue, twoSlotPatch } from "./field-value-bridge";
import { BUILDER_NODE_BACKGROUND_OPTIONS } from "./style-options";
import { parseStyleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { BUILDER_NODE_THEME_COLOR_TOKENS, ThemeBindRow, colorSwatchDisplay } from "./section-shared";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import type { StandaloneSectionCtx } from "./section-types";

export type AppearanceSectionProps = Pick<
  StandaloneSectionCtx,
  "nodeColorField" | "patchSelectedStandaloneStyle" | "selectedStandaloneStyleNode" | "selectedStandaloneViewportStyle" | "setNodeColorField" | "setOrToggleStandaloneStyle"
>;

const SURFACE_KINDS = ["container", "split", "card", "cta_group"];
const CORNERED_KINDS = ["container", "split", "card", "cta_group", "button", "image"];
const TEXT_COLOR_KINDS = ["heading", "paragraph", "button"];
const FILL_KINDS = ["container", "split", "card", "cta_group", "button"];

/**
 * D4 — the "Appearance" group's BODY (fill, corners, border, colour). The
 * `InspectorGroup` wrapper moved to `groups/AppearanceGroup.tsx`, which also
 * mounts the surface/depth fields (shadow, opacity, background image) that
 * used to be buried inside the old "Effects & motion" accordion.
 */
export function AppearanceBody({
  nodeColorField,
  patchSelectedStandaloneStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  setNodeColorField,
  setOrToggleStandaloneStyle,
}: AppearanceSectionProps) {
  const kind = selectedStandaloneStyleNode.kind;
  const style = selectedStandaloneViewportStyle;
  // A theme-bound radius is not a number the operator owns; the bind row below
  // is the control for it, so the tiles + exact input stand down rather than
  // offering an edit that the binding would immediately overwrite.
  const radiusIsBound = Boolean(parseStyleTokenRef(style?.borderRadius));

  return (
    <>
      {SURFACE_KINDS.includes(kind) ? (
        <SegmentedField
          dataControl="background"
          label="Background"
          value={style?.background ?? ""}
          onChange={(next) => setOrToggleStandaloneStyle("background", next)}
          options={BUILDER_NODE_BACKGROUND_OPTIONS}
        />
      ) : null}

      {/* ── Corners: D9 item 3 + item 2 in one row ───────────────────────── */}
      {CORNERED_KINDS.includes(kind) ? (
        <>
          {radiusIsBound ? null : (
            <GlyphTiles
              dataControl="radius"
              label="Corners"
              searchTerms={["Corners", "corner radius", "rounded", "border radius"]}
              options={radiusTileOptions(RADIUS_PRESETS)}
              columns={3}
              value={radiusTileValue(style)}
              onChange={(next) => {
                const patch = twoSlotPatch(
                  next ? { kind: "preset", id: next } : { kind: "unset" },
                );
                patchSelectedStandaloneStyle({
                  radius: patch.token as BuilderNodeStyleValue["radius"],
                  borderRadius: patch.free,
                });
              }}
              exact={
                <NumberUnit
                  units={["px", "rem", "%"]}
                  defaultUnit="px"
                  placeholder="—"
                  min={0}
                  width={92}
                  value={parseCssLength(style?.borderRadius)}
                  onChange={(next) => {
                    const patch = twoSlotPatch(
                      next
                        ? { kind: "custom", numeric: next }
                        : { kind: "unset" },
                    );
                    patchSelectedStandaloneStyle({
                      radius: patch.token as BuilderNodeStyleValue["radius"],
                      borderRadius: patch.free,
                    });
                  }}
                />
              }
            />
          )}
          {/* Per-corner radius — writes the same borderRadius shorthand the
              free field stores ("16px 16px 0 0"), clearing the radius token so
              the exact value wins. Stands down on a theme-bound radius (the
              bind row is that value's control). */}
          {radiusIsBound ? null : (
            <CornerRadiusField
              value={style?.borderRadius}
              onChange={(next) =>
                patchSelectedStandaloneStyle({
                  borderRadius: next,
                  radius: next !== undefined ? undefined : style?.radius,
                })
              }
            />
          )}
          <ThemeBindRow
            prop="borderRadius"
            value={style?.borderRadius}
            onSet={(sentinel) => patchSelectedStandaloneStyle({ borderRadius: sentinel })}
            onDetach={() => patchSelectedStandaloneStyle({ borderRadius: undefined })}
          />
        </>
      ) : null}

      {/* ── Color & border ───────────────────────────────────────────────── */}
      {!["divider", "spacer"].includes(kind) ? (
        <div
          className="flex flex-col gap-2 border-t pt-3"
          data-builder-node-style-control="color"
          style={{ borderColor: CHROME.line }}
        >
          {TEXT_COLOR_KINDS.includes(kind) ? (
            <FieldRow
              dataControl="textColor"
              label="Text"
              searchTerms={["Text color", "type color", "foreground"]}
            >
              <SwatchControl
                ariaLabel="Pick text color"
                value={style?.textColor}
                onClear={() => patchSelectedStandaloneStyle({ textColor: undefined })}
                onPick={(anchor) =>
                  setNodeColorField((prev) =>
                    prev?.field === "textColor" ? null : { field: "textColor", anchor },
                  )
                }
              />
            </FieldRow>
          ) : null}

          {FILL_KINDS.includes(kind) ? (
            <FieldRow
              dataControl="backgroundColor"
              label="Fill"
              searchTerms={["Fill", "background color", "surface color"]}
            >
              <SwatchControl
                ariaLabel="Pick fill color"
                value={style?.backgroundColor}
                onClear={() => patchSelectedStandaloneStyle({ backgroundColor: undefined })}
                onPick={(anchor) =>
                  setNodeColorField((prev) =>
                    prev?.field === "backgroundColor"
                      ? null
                      : { field: "backgroundColor", anchor },
                  )
                }
              />
            </FieldRow>
          ) : null}

          {CORNERED_KINDS.includes(kind) ? (
            <>
              <FieldRow
                dataControl="borderColor"
                label="Border color"
                searchTerms={["Border color", "edge color", "outline color"]}
              >
                <SwatchControl
                  ariaLabel="Pick border color"
                  value={style?.borderColor}
                  onClear={() => patchSelectedStandaloneStyle({ borderColor: undefined })}
                  onPick={(anchor) =>
                    setNodeColorField((prev) =>
                      prev?.field === "borderColor"
                        ? null
                        : { field: "borderColor", anchor },
                    )
                  }
                />
              </FieldRow>

              <GlyphTiles
                dataControl="borderStyle"
                label="Border"
                searchTerms={["Border style", "dashed", "dotted", "solid", "stroke"]}
                options={lineStyleTileOptions(BORDER_STYLE_PRESETS)}
                columns={4}
                value={style?.borderStyle ?? ""}
                onChange={(next) =>
                  patchSelectedStandaloneStyle({
                    borderStyle: (next || undefined) as BuilderNodeStyleValue["borderStyle"],
                  })
                }
              />

              <GlyphTiles
                dataControl="borderWidth"
                label="Weight"
                searchTerms={["Border width", "border weight", "thickness", "stroke width"]}
                options={borderWeightTileOptions(BORDER_WIDTH_PRESETS)}
                columns={4}
                value={style?.borderWidth ?? ""}
                onChange={(next) =>
                  patchSelectedStandaloneStyle({ borderWidth: next || undefined })
                }
                exact={
                  <NumberUnit
                    units={["px"]}
                    defaultUnit="px"
                    placeholder="—"
                    min={0}
                    width={78}
                    value={parseCssLength(style?.borderWidth)}
                    onChange={(next) =>
                      patchSelectedStandaloneStyle({
                        borderWidth: next ? formatLength(next) : undefined,
                      })
                    }
                  />
                }
              />

              {/* Per-side border widths — writes the border-width shorthand
                  the renderer already emits ("1px 0 0"), so a card can carry
                  a top rule only without customCss. */}
              <BorderSidesField
                value={style?.borderWidth}
                onChange={(next) =>
                  patchSelectedStandaloneStyle({ borderWidth: next })
                }
              />
            </>
          ) : null}

          <ColorPickerPopover
            open={nodeColorField !== null}
            anchor={nodeColorField?.anchor ?? null}
            value={
              (nodeColorField ? style?.[nodeColorField.field] : undefined) || "#111111"
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
    </>
  );
}

/**
 * Which radius tile is lit. A free `borderRadius` beats the token, because the
 * renderer layers it last — see `twoSlotFieldValue`, which this defers to so
 * the two cannot drift.
 */
function radiusTileValue(style: BuilderNodeStyleValue | undefined): string {
  const value = twoSlotFieldValue(style?.radius, style?.borderRadius);
  return value.kind === "preset" ? value.id : "";
}

/**
 * The swatch + Clear pair, once. It appeared three times in this file with
 * three copies of the same inline styling; the audit counted that kind of
 * duplication as one of the 20 control patterns.
 */
function SwatchControl({
  ariaLabel,
  value,
  onClear,
  onPick,
}: {
  ariaLabel: string;
  value: string | undefined;
  onClear: () => void;
  onPick: (anchor: HTMLButtonElement) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {value ? (
        <button
          type="button"
          onClick={onClear}
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
        aria-label={ariaLabel}
        onClick={(e) => onPick(e.currentTarget)}
        className="cursor-pointer"
        style={inspectorColorSwatchStyle(Boolean(value), colorSwatchDisplay(value), {
          border: `1px solid ${CHROME.lineMid}`,
        })}
      />
    </div>
  );
}
