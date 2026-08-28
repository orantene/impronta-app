/**
 * StylePanel · the ONE "Advanced" group — Inspector Reset D4, annotation E.
 *
 * "The ~40 CSS-spec fields (clip path, backdrop, scroll-snap…) live in one
 * place, named in product language with the spec term as the hint — not
 * scattered across three 'effects' files."
 *
 * WHAT IS INSIDE, AND WHERE IT CAME FROM
 * --------------------------------------
 *   Position & layout   — was its own always-on accordion (position, inset,
 *                         z-index, flex/grid, overflow, container query)
 *   Motion & states     — was the "Effects & motion" accordion, minus the
 *                         surface/depth block that moved to Appearance
 *   Scroll motion       — parallax / reveal-on-view
 *   Show or hide        — was a LOOSE block below all six accordions, with no
 *                         group at all, so search could never reach it
 *   Custom CSS          — was a LOOSE `<details>` below that, same problem
 *
 * The last two are the reason this file exists rather than the Advanced
 * accordion being assembled inline: folding them in is what makes the panel
 * end at "one Advanced" instead of "one Advanced, and then two more things".
 * Moving them here also takes them out of `style-panel.tsx`, which is
 * line-ratcheted — extraction, never a raised budget.
 *
 * ALWAYS PRESENT. Every kind has visibility and custom CSS, so this group is
 * never the empty accordion D3 forbids. It never opens by default: opening it
 * would restore the wall of spec-named fields the reset exists to remove.
 */

import { CHROME } from "../../../kit/tokens";
import { Segmented } from "../../../kit/segmented";
import { InspectorGroup } from "../../kit";
import {
  INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL,
  INSPECTOR_HELP_TEXT_CLASS as HINT,
} from "../../kit/inspector-ui";
import { CssEditorWithHints } from "../../kit/css-editor-with-hints";
import { EffectsMotionBody, type EffectsSectionProps } from "../EffectsSection";
import {
  PositionLayoutBody,
  type PositionLayoutSectionProps,
} from "../PositionLayoutSection";
import { BUILDER_NODE_VISIBILITY_OPTIONS } from "../style-options";
import { STYLE_GROUP_SEARCH_TERMS, STYLE_GROUP_TITLES } from "../group-recipes";
import type { StandaloneSectionCtx } from "../section-types";

export type AdvancedGroupProps = EffectsSectionProps &
  PositionLayoutSectionProps &
  Pick<StandaloneSectionCtx, "selectedViewport">;

export function AdvancedGroup(props: AdvancedGroupProps) {
  const {
    patchSelectedBaseStyle,
    patchSelectedStandaloneStyle,
    selectedStandaloneFullStyle,
    selectedStandaloneStyleNode,
    selectedStandaloneViewportStyle,
    selectedViewport,
  } = props;

  return (
    <InspectorGroup
      title={STYLE_GROUP_TITLES.advanced}
      collapsible
      advanced
      storageKey={`style-panel:advanced:${selectedStandaloneStyleNode.kind}`}
      defaultOpen={false}
      searchTerms={STYLE_GROUP_SEARCH_TERMS.advanced}
    >
      <PositionLayoutBody
        patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
        selectedStandaloneStyleNode={selectedStandaloneStyleNode}
        selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
        selectedViewport={selectedViewport}
      />

      <EffectsMotionBody
        patchSelectedBaseStyle={props.patchSelectedBaseStyle}
        patchSelectedHoverStyle={props.patchSelectedHoverStyle}
        patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
        patchSelectedStateStyle={props.patchSelectedStateStyle}
        selectedInteractionState={props.selectedInteractionState}
        selectedStandaloneFullStyle={selectedStandaloneFullStyle}
        selectedStandaloneStyleNode={selectedStandaloneStyleNode}
        selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
        selectedViewport={selectedViewport}
        setOrToggleStandaloneStyle={props.setOrToggleStandaloneStyle}
        setSelectedInteractionState={props.setSelectedInteractionState}
      />

      {/* ── Show or hide ────────────────────────────────────────────────────
          Moved in from the loose block that sat below every accordion. D4's
          plain-language rule applies to the LABEL: the operator's question is
          "should this show here", not "what is `visibility`". The CSS term
          stays reachable through the group's search terms. */}
      <div
        className="flex flex-col gap-1.5 border-t pt-3"
        data-builder-node-style-control="visibility"
        style={{ borderColor: CHROME.line }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={FIELD_LABEL}>Show or hide</span>
          {selectedStandaloneViewportStyle?.visibility === "hidden" ? (
            <span className={HINT}>
              {selectedViewport === "desktop"
                ? "Hidden everywhere"
                : `Hidden on ${selectedViewport}`}
            </span>
          ) : null}
        </div>
        <Segmented
          fullWidth
          compact
          value={selectedStandaloneViewportStyle?.visibility ?? ""}
          onChange={(next) =>
            patchSelectedStandaloneStyle({
              visibility: next === "hidden" ? "hidden" : undefined,
            })
          }
          options={BUILDER_NODE_VISIBILITY_OPTIONS}
        />
        <span className={HINT}>
          {selectedViewport === "desktop"
            ? "Hides on every screen. Switch to tablet/mobile to hide only there."
            : `Hides only on ${selectedViewport}; desktop stays shown.`}
        </span>
      </div>

      {/* ── Custom CSS ──────────────────────────────────────────────────────
          Moved in from the loose `<details>` that sat at the very bottom of
          the panel. Its own disclosure is gone: it is already inside Advanced,
          and a disclosure inside a collapsed accordion is two clicks to reach
          one textarea. The scope-confinement contract is unchanged — the
          renderer's hardened `nodeScopedCss` still pins these rules to this
          node's `[data-builder-node-id]`, base-style only. */}
      <div
        className="flex flex-col gap-2 border-t pt-3"
        data-builder-node-style-control="customCss"
        style={{ borderColor: CHROME.line }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={FIELD_LABEL}>Custom CSS</span>
          {selectedStandaloneFullStyle?.customCss ? (
            <button
              type="button"
              onClick={() => patchSelectedBaseStyle({ customCss: undefined })}
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
        </div>
        <CssEditorWithHints
          value={selectedStandaloneFullStyle?.customCss ?? ""}
          onValueChange={(next) =>
            patchSelectedBaseStyle({
              customCss: next || undefined,
            })
          }
          placeholder={
            "/* Scoped to this block. Modern CSS supported. */\n.headline {\n  letter-spacing: -0.02em;\n}"
          }
          rows={6}
          ariaLabel="Custom CSS for this block"
        />
        <span className={HINT}>
          Scoped to this block and its contents. Cannot affect the rest of the
          page.
        </span>
      </div>
    </InspectorGroup>
  );
}
