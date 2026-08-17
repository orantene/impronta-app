/**
 * StylePanel · the "Text" group — Inspector Reset D4.
 *
 * One accordion, mounted only for kinds whose own content is text (see
 * `TEXT_KINDS` in group-recipes.ts). Was titled "Typography"; "Text" is the
 * plain-language name D4 asks for outside Advanced.
 *
 * The group wrapper lives here rather than inside `TypographySection.tsx` so
 * that the recipe — not the section module — decides whether the accordion
 * exists at all. That is the whole point of D3/D4: a container no longer gets
 * a "Typography" header holding one Align control.
 */

import { InspectorGroup } from "../../kit";
import { TypographyBody, type TypographySectionProps } from "../TypographySection";
import { STYLE_GROUP_SEARCH_TERMS, STYLE_GROUP_TITLES } from "../group-recipes";

export type TextGroupProps = TypographySectionProps & {
  /** D4 — the recipe's first-meaningful-group choice for this kind. */
  defaultOpen: boolean;
};

export function TextGroup({ defaultOpen, ...body }: TextGroupProps) {
  return (
    <InspectorGroup
      title={STYLE_GROUP_TITLES.text}
      collapsible
      // Persistence contract preserved from the pre-D4 groups: per-kind key in
      // sessionStorage, so the operator's own open/closed choice survives
      // re-selection. Key is NEW (`text:` not `typography:`) because the group
      // is a new composition — an old stored bit would be asserting a choice
      // about a different accordion.
      storageKey={`style-panel:text:${body.selectedStandaloneStyleNode.kind}`}
      defaultOpen={defaultOpen}
      searchTerms={STYLE_GROUP_SEARCH_TERMS.text}
    >
      <TypographyBody {...body} />
    </InspectorGroup>
  );
}
