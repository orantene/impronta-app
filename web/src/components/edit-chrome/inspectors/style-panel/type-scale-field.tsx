"use client";

/**
 * StylePanel · TEXT SIZE — one field, the type scale first.
 *
 * It used to be two controls that never mentioned each other: a "Size"
 * segmented (S / M / L / XL / Display, no numbers anywhere) near the top of the
 * Text group, and a second field ALSO labelled "Size" further down that took a
 * raw length. Two controls, one name, and the raw one is the one that wins in
 * the renderer — `style.fontSize` is an inline style, the `size` tier is a CSS
 * rule, so a node carrying both renders the raw number and lights the tier
 * chip. That is how a page ends up with `fontSize: "58px"` sitting on top of a
 * `size: "xl"` nobody can see is dead.
 *
 * They are one two-slot field, and this is it: the tier tokens as the primary
 * steps, each captioned with the px range its `clamp()` really resolves to
 * (21.6-36, not "L"), and the exact length beside them, writing `fontSize`.
 * `field-value-bridge` clears whichever slot is not in play, so the two can no
 * longer disagree.
 *
 * PARAGRAPH NODES resolve lg / xl / display to a SMALLER clamp than headings
 * do, so the captions are switched per node kind rather than printing a
 * heading's numbers over a paragraph.
 *
 * The tiers are fluid, so no tier has a single number to fill the exact input
 * with: picking a tier leaves the input empty, which is the honest answer for
 * a value that is a range.
 */

import { PresetNumberRow, TEXT_SIZE_PRESETS, TEXT_SIZE_PRESETS_PARAGRAPH } from "../field-kit";
import { InspectorOverrideBadge } from "../kit/inspector-ui";
import { getStyleOverrideDevice } from "../responsive-field-state";
import { twoSlotFieldValue, twoSlotPatch } from "./field-value-bridge";
import type { StandaloneSectionCtx } from "./section-types";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";

export type TypeScaleFieldProps = Pick<
  StandaloneSectionCtx,
  | "patchSelectedStandaloneStyle"
  | "selectedStandaloneFullStyle"
  | "selectedStandaloneStyleNode"
  | "selectedStandaloneViewportStyle"
  | "selectedViewport"
>;

type SizeToken = BuilderNodeStyleValue["size"];

export function TypeScaleField({
  patchSelectedStandaloneStyle,
  selectedStandaloneFullStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  selectedViewport,
}: TypeScaleFieldProps) {
  const overrideDevice =
    getStyleOverrideDevice(selectedStandaloneFullStyle, "size") ??
    getStyleOverrideDevice(selectedStandaloneFullStyle, "fontSize");

  return (
    <PresetNumberRow
      dataControl="size"
      label="Text size"
      hint="The steps are your type scale. An exact size is still yours to set."
      searchTerms={["Size", "Text size", "font size", "type scale"]}
      presets={
        selectedStandaloneStyleNode.kind === "paragraph"
          ? TEXT_SIZE_PRESETS_PARAGRAPH
          : TEXT_SIZE_PRESETS
      }
      units={["px", "rem", "em"]}
      placeholder="Theme"
      value={twoSlotFieldValue(
        selectedStandaloneViewportStyle?.size,
        selectedStandaloneViewportStyle?.fontSize,
      )}
      onChange={(next) => {
        const patch = twoSlotPatch(next);
        patchSelectedStandaloneStyle({
          size: patch.token as SizeToken,
          fontSize: patch.free,
        });
      }}
      accessory={
        overrideDevice ? (
          <InspectorOverrideBadge
            device={overrideDevice}
            onReset={
              selectedViewport !== "desktop"
                ? () =>
                    patchSelectedStandaloneStyle({
                      size: undefined,
                      fontSize: undefined,
                    })
                : undefined
            }
          />
        ) : null
      }
    />
  );
}
