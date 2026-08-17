/**
 * StylePanel · the group stack — Inspector Reset D4's hierarchy, in one place.
 *
 * `style-panel.tsx` used to mount six section components in a hardcoded row,
 * every one of them for every selection. This component replaces that row with
 * a recipe read: ask `styleGroupsForKind` which groups this kind gets, render
 * them in `STYLE_GROUP_ORDER`, and open the one `firstOpenStyleGroup` names.
 *
 * The panel's surrounding order is unchanged and is D4's:
 *
 *     identity → device strip → quick styles → [THIS STACK] → footer row
 *
 * so this component owns exactly the "2-3 meaningful groups (first one open)
 * → one Advanced" middle.
 *
 * WHY THIS IS A COMPONENT AND NOT A LOOP INLINE
 * ---------------------------------------------
 * The four groups take genuinely different prop sets (Appearance needs the
 * colour-popover state, Advanced needs the interaction-state machine, Text
 * needs the font picker). A `.map()` over group ids would have to widen every
 * group to the union of all props, which is how a panel starts threading
 * values into components that ignore them. An explicit switch keeps each
 * group's contract honest, and the ORDER still comes from the shared constant
 * rather than from the order these branches happen to be written in.
 */

import { Fragment } from "react";

import {
  STYLE_GROUP_ORDER,
  firstOpenStyleGroup,
  styleGroupsForKind,
  type StyleGroupId,
} from "../group-recipes";
import { AdvancedGroup } from "./AdvancedGroup";
import { AppearanceGroup } from "./AppearanceGroup";
import { LayoutSpacingGroup } from "./LayoutSpacingGroup";
import { TextGroup } from "./TextGroup";
import type { StandaloneSectionCtx } from "../section-types";

export type StyleGroupStackProps = Omit<StandaloneSectionCtx, "device">;

export function StyleGroupStack(ctx: StyleGroupStackProps) {
  const kind = ctx.selectedStandaloneStyleNode.kind;
  const enabled = new Set<StyleGroupId>(styleGroupsForKind(kind));
  const firstOpen = firstOpenStyleGroup(kind);

  return (
    <>
      {STYLE_GROUP_ORDER.filter((group) => enabled.has(group)).map((group) => (
        <Fragment key={group}>
          {group === "text" ? (
            <TextGroup
              defaultOpen={firstOpen === "text"}
              nodeFontPickerOpen={ctx.nodeFontPickerOpen}
              patchSelectedStandaloneStyle={ctx.patchSelectedStandaloneStyle}
              selectedStandaloneFullStyle={ctx.selectedStandaloneFullStyle}
              selectedStandaloneStyleNode={ctx.selectedStandaloneStyleNode}
              selectedStandaloneViewportStyle={ctx.selectedStandaloneViewportStyle}
              selectedViewport={ctx.selectedViewport}
              setNodeFontPickerOpen={ctx.setNodeFontPickerOpen}
              setOrToggleStandaloneStyle={ctx.setOrToggleStandaloneStyle}
              typographyHasResponsiveOverride={ctx.typographyHasResponsiveOverride}
            />
          ) : null}

          {group === "layout" ? (
            <LayoutSpacingGroup
              defaultOpen={firstOpen === "layout"}
              patchSelectedStandaloneStyle={ctx.patchSelectedStandaloneStyle}
              selectedStandaloneFullStyle={ctx.selectedStandaloneFullStyle}
              selectedStandaloneStyleNode={ctx.selectedStandaloneStyleNode}
              selectedStandaloneViewportStyle={ctx.selectedStandaloneViewportStyle}
              selectedViewport={ctx.selectedViewport}
              setOrToggleStandaloneStyle={ctx.setOrToggleStandaloneStyle}
              spacingHasResponsiveOverride={ctx.spacingHasResponsiveOverride}
            />
          ) : null}

          {group === "appearance" ? (
            <AppearanceGroup
              defaultOpen={firstOpen === "appearance"}
              nodeColorField={ctx.nodeColorField}
              patchSelectedStandaloneStyle={ctx.patchSelectedStandaloneStyle}
              selectedStandaloneStyleNode={ctx.selectedStandaloneStyleNode}
              selectedStandaloneViewportStyle={ctx.selectedStandaloneViewportStyle}
              setNodeColorField={ctx.setNodeColorField}
              setOrToggleStandaloneStyle={ctx.setOrToggleStandaloneStyle}
            />
          ) : null}

          {group === "advanced" ? (
            <AdvancedGroup
              patchSelectedBaseStyle={ctx.patchSelectedBaseStyle}
              patchSelectedHoverStyle={ctx.patchSelectedHoverStyle}
              patchSelectedStandaloneStyle={ctx.patchSelectedStandaloneStyle}
              patchSelectedStateStyle={ctx.patchSelectedStateStyle}
              selectedInteractionState={ctx.selectedInteractionState}
              selectedStandaloneFullStyle={ctx.selectedStandaloneFullStyle}
              selectedStandaloneStyleNode={ctx.selectedStandaloneStyleNode}
              selectedStandaloneViewportStyle={ctx.selectedStandaloneViewportStyle}
              selectedViewport={ctx.selectedViewport}
              setOrToggleStandaloneStyle={ctx.setOrToggleStandaloneStyle}
              setSelectedInteractionState={ctx.setSelectedInteractionState}
            />
          ) : null}
        </Fragment>
      ))}
    </>
  );
}
