"use client";

/**
 * Inspector FIELD KIT — the one field scaffold.
 *
 * label column + control + accessory + hint. That is the whole component, and
 * that is the point: the audit found the inspector's ragged left edge came
 * from ~20 sections each choosing their own label width, label weight, and
 * label-to-control gap. Every field-kit primitive renders through this, so
 * there is exactly one answer.
 *
 * ── LABEL IS A LABEL ──────────────────────────────────────────────────────
 * D7: the audit counted 19 disclosures disguised as labels — `<details>`
 * summaries, click-to-expand headings, and rows whose label secretly toggled
 * something. A `FieldRow` label does NOTHING when clicked except focus its
 * control. If a field needs progressive disclosure, that belongs to the
 * SECTION (InspectorGroup / InspectorAccordion), never to a field's own label.
 *
 * ── SEARCH REGISTRATION (the contract P2 gets for free) ───────────────────
 * Pass `searchTerms` and the row participates in "Find a setting" with no
 * further wiring: it calls `useInspectorSearchFilter`, which does a
 * case-insensitive substring match against the live query and returns true
 * when the row should be hidden. ANY term matching keeps the row visible, so
 * pass synonyms the operator might reach for ("Corner radius", "rounded",
 * "border radius") rather than only the visible label.
 *
 * A row with NO `searchTerms` falls back to its `label` when the label is a
 * plain string. That fallback is deliberate: forgetting the prop should
 * degrade to "searchable by its visible name", not to "invisible to search"
 * and not to "always visible during a search". A row whose label is a
 * ReactNode and which passes no terms stays visible during a search, because
 * the kit has no text to judge it by and hiding it would be a guess.
 *
 * ── ORIENTATION ───────────────────────────────────────────────────────────
 * Two layouts, no more. `inline` (default) puts the label in a fixed column
 * beside the control — the dense default for a 300px inspector. `stacked` puts
 * it above, for controls that need the full width (a glyph-tile grid, a long
 * chip row). Anything else is a section-level layout decision, not a field one.
 */

import { useId, type CSSProperties, type ReactNode } from "react";

import { InspectorInfoTip } from "../kit/inspector-info-tip";
import { useInspectorSearchFilter } from "../kit/inspector-search";
import { useInspectorT } from "../kit/use-inspector-t";
import { FIELD_KIT } from "./tokens";

export interface FieldRowProps {
  /** The field's name. A plain string is translated at the kit boundary. */
  label: ReactNode;
  /** The control itself. */
  children: ReactNode;
  /**
   * Trailing slot on the label line: responsive override badges, lock badges,
   * reset affordances. P2 passes `InspectorOverrideBadge` / `LockBadge` here.
   */
  accessory?: ReactNode;
  /** One line of plain-language help. Renders behind an ⓘ on the label line
   *  unless `hintPlacement="inline"`. Never a disclosure. */
  hint?: ReactNode;
  /**
   * "tip" (default) hangs the hint off an ⓘ beside the label — the same
   * pattern as the kit primitives (`InspectorFieldShell`). Pass "inline" for
   * copy that must stay standing (live state, warnings, disabled reasons).
   */
  hintPlacement?: "tip" | "inline";
  /**
   * Terms this row answers to in "Find a setting". Defaults to the label when
   * the label is a string. See the search contract above.
   */
  searchTerms?: string | string[];
  /** Label above the control instead of beside it. */
  orientation?: "inline" | "stacked";
  /** Dim + block the control. The row stays visible and searchable. */
  disabled?: boolean;
  /**
   * The id of the control this label names. Supply it when the control is a
   * single focusable input; omit it for a radiogroup (which names itself with
   * `aria-labelledby`, wired automatically below).
   */
  htmlFor?: string;
  /**
   * Set by primitives whose control is a group rather than one input, so the
   * label element becomes the group's accessible name.
   */
  groupLabelId?: string;
  className?: string;
  style?: CSSProperties;
  /** Debug/QA hook, mirrors `data-builder-node-style-control` in the panels. */
  dataControl?: string;
}

export function FieldRow({
  label,
  children,
  accessory,
  hint,
  hintPlacement = "tip",
  searchTerms,
  orientation = "inline",
  disabled = false,
  htmlFor,
  groupLabelId,
  className,
  style,
  dataControl,
}: FieldRowProps) {
  const { tn } = useInspectorT();
  const fallbackId = useId();
  const labelId = groupLabelId ?? fallbackId;

  // Search registration. `useInspectorSearchFilter` is a hook, so it is called
  // unconditionally; when the kit has NO text to judge the row by, its verdict
  // is discarded and the row stays visible. Erring toward visible matters:
  // a control that vanishes from a search it should have matched is a control
  // the operator concludes does not exist.
  const terms = resolveSearchTerms(searchTerms, label);
  const filteredOut = useInspectorSearchFilter(terms);
  if (terms.length > 0 && filteredOut) return null;

  const hintAsTip = hint !== undefined && hint !== null && hintPlacement === "tip";
  const labelNode = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: FIELD_KIT.gap.tight,
        width: orientation === "inline" ? FIELD_KIT.size.labelColumn : undefined,
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          minWidth: 0,
        }}
      >
        <label
          id={labelId}
          htmlFor={htmlFor}
          style={{
            fontSize: FIELD_KIT.font.label,
            fontWeight: FIELD_KIT.weight.label,
            letterSpacing: "-0.005em",
            color: disabled ? FIELD_KIT.mutedSoft : FIELD_KIT.ink,
            // A label is a label. No pointer cursor unless it actually focuses
            // something, and never a disclosure affordance.
            cursor: htmlFor ? "pointer" : "default",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {tn(label)}
        </label>
        {hintAsTip ? (
          <InspectorInfoTip
            content={hint}
            title={typeof label === "string" ? label : undefined}
          />
        ) : null}
      </span>
      {accessory ? <span style={{ display: "flex", flexShrink: 0 }}>{accessory}</span> : null}
    </div>
  );

  return (
    <div
      className={className}
      data-field-kit-row=""
      data-builder-node-style-control={dataControl}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: FIELD_KIT.gap.tight,
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: orientation === "inline" ? "row" : "column",
          alignItems: orientation === "inline" ? "center" : "stretch",
          gap: FIELD_KIT.gap.control,
          minWidth: 0,
        }}
      >
        {labelNode}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
      {hint && !hintAsTip ? (
        <div
          style={{
            fontSize: FIELD_KIT.font.caption,
            fontWeight: FIELD_KIT.weight.caption,
            lineHeight: 1.4,
            color: FIELD_KIT.muted,
            paddingLeft:
              orientation === "inline"
                ? FIELD_KIT.size.labelColumn + FIELD_KIT.gap.control
                : 0,
          }}
        >
          {tn(hint)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Resolve the terms a row is searchable by.
 *
 * Returns an EMPTY array when the row has no text at all — neither explicit
 * terms nor a string label. `FieldRow` reads that as "do not filter this row",
 * so such a row survives every search. Exported because this fallback ladder
 * is the search contract P2 relies on, and it is pinned by a test.
 */
export function resolveSearchTerms(
  searchTerms: string | string[] | undefined,
  label: ReactNode,
): string[] {
  if (Array.isArray(searchTerms)) {
    const cleaned = searchTerms.filter((t) => t.trim().length > 0);
    if (cleaned.length > 0) return cleaned;
  } else if (typeof searchTerms === "string" && searchTerms.trim().length > 0) {
    return [searchTerms];
  }
  if (typeof label === "string" && label.trim().length > 0) return [label];
  return [];
}
