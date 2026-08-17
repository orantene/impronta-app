/**
 * StylePanel · the "Appearance" group — Inspector Reset D4.
 *
 * Fill, corners, border, colour — plus the surface/depth fields (shadow, text
 * shadow, background image, opacity) that D4 pulls FORWARD out of the old
 * "Effects & motion" accordion. The audit's headline search failure was that
 * typing "shadow" hid the group containing the shadow control; the deeper
 * problem was that shadow was never in a group an operator would open. It is
 * now beside the fill and the corners, where the mockup draws it.
 *
 * Not mounted at all for `spacer` / `divider` / `section_embed` — the mockup's
 * "no empty 'Appearance' on a divider". See `NO_APPEARANCE_KINDS`.
 */

import { InspectorGroup } from "../../kit";
import { AppearanceBody, type AppearanceSectionProps } from "../AppearanceSection";
import { SurfaceDepthBody } from "../EffectsSurfaceSection";
import { STYLE_GROUP_SEARCH_TERMS, STYLE_GROUP_TITLES } from "../group-recipes";

export type AppearanceGroupProps = AppearanceSectionProps & {
  /** D4 — the recipe's first-meaningful-group choice for this kind. */
  defaultOpen: boolean;
};

export function AppearanceGroup({
  defaultOpen,
  nodeColorField,
  patchSelectedStandaloneStyle,
  selectedStandaloneStyleNode,
  selectedStandaloneViewportStyle,
  setNodeColorField,
  setOrToggleStandaloneStyle,
}: AppearanceGroupProps) {
  return (
    <InspectorGroup
      title={STYLE_GROUP_TITLES.appearance}
      collapsible
      storageKey={`style-panel:appearance:${selectedStandaloneStyleNode.kind}`}
      defaultOpen={defaultOpen}
      searchTerms={STYLE_GROUP_SEARCH_TERMS.appearance}
    >
      <AppearanceBody
        nodeColorField={nodeColorField}
        patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
        selectedStandaloneStyleNode={selectedStandaloneStyleNode}
        selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
        setNodeColorField={setNodeColorField}
        setOrToggleStandaloneStyle={setOrToggleStandaloneStyle}
      />
      <SurfaceDepthBody
        patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
        selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
        setOrToggleStandaloneStyle={setOrToggleStandaloneStyle}
      />
    </InspectorGroup>
  );
}
