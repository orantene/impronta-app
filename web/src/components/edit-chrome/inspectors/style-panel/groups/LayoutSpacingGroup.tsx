/**
 * StylePanel · the "Layout & spacing" group — Inspector Reset D4.
 *
 * The mockup draws ONE group holding padding, gap and max width. Before D4
 * those were two always-on accordions ("Dimensions" and "Spacing") whose
 * split matched the CSS spec, not the operator's question — "how big is this
 * and how much room is around it" is one question.
 *
 * Order inside the group follows the mockup: spacing first (padding / gap are
 * what an operator reaches for), then size (max width and the exact pair).
 * Every kind gets this group; it is never empty.
 */

import { InspectorGroup } from "../../kit";
import { DimensionsBody, type DimensionsSectionProps } from "../DimensionsSection";
import { SpacingBody, type SpacingSectionProps } from "../SpacingSection";
import { StyleAlignField, type StyleAlignFieldProps } from "../TypographySection";
import { ARRANGE_KINDS, STYLE_GROUP_SEARCH_TERMS, STYLE_GROUP_TITLES, layoutGroupOwnsAlign } from "../group-recipes";
import { ArrangeBody } from "./ArrangeGroup";

export type LayoutSpacingGroupProps = SpacingSectionProps &
  DimensionsSectionProps &
  StyleAlignFieldProps & {
    /** D4 — the recipe's first-meaningful-group choice for this kind. */
    defaultOpen: boolean;
  };

export function LayoutSpacingGroup(props: LayoutSpacingGroupProps) {
  const {
    defaultOpen,
    patchSelectedStandaloneStyle,
    selectedStandaloneFullStyle,
    selectedStandaloneStyleNode,
    selectedStandaloneViewportStyle,
    selectedViewport,
    setOrToggleStandaloneStyle,
    spacingHasResponsiveOverride,
  } = props;
  const kind = selectedStandaloneStyleNode.kind;

  return (
    <InspectorGroup
      title={STYLE_GROUP_TITLES.layout}
      collapsible
      storageKey={`style-panel:layout:${kind}`}
      defaultOpen={defaultOpen}
      searchTerms={STYLE_GROUP_SEARCH_TERMS.layout}
    >
      {/* D4 — Align is re-homed, not deleted. Kinds with no Text group (a
          container, a card…) used to reach Align through a "Typography"
          accordion that held nothing else. It renders here instead, where a
          container's alignment is a layout decision anyway. */}
      {/* Arrangement of this box's CHILDREN. The same writes exist in Advanced
          under their CSS names; this is the plain-language path, because
          centring a header row should not require opening "Advanced". */}
      {ARRANGE_KINDS.has(kind) ? (
        <ArrangeBody
          patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
          selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
        />
      ) : null}
      {layoutGroupOwnsAlign(kind) ? (
        <StyleAlignField
          patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
          selectedStandaloneFullStyle={selectedStandaloneFullStyle}
          selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
          selectedViewport={selectedViewport}
          setOrToggleStandaloneStyle={setOrToggleStandaloneStyle}
        />
      ) : null}

      <SpacingBody
        patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
        selectedStandaloneFullStyle={selectedStandaloneFullStyle}
        selectedStandaloneStyleNode={selectedStandaloneStyleNode}
        selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
        selectedViewport={selectedViewport}
        setOrToggleStandaloneStyle={setOrToggleStandaloneStyle}
        spacingHasResponsiveOverride={spacingHasResponsiveOverride}
      />

      <DimensionsBody
        selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
        patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
      />
    </InspectorGroup>
  );
}
