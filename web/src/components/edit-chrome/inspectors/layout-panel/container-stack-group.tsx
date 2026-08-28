"use client";

/**
 * Layout tab — THE STACK GROUP, which now leads the panel.
 *
 * The mandate this serves, in the owner's words: "the layout engine only
 * speaks in layouts that work" and "a user can't break layouts and still have
 * flexibility." The engine already holds up its end. This group is the
 * inspector finally agreeing with it: the four decisions that actually shape a
 * layout — which way children flow, whether they wrap, how they line up, and
 * how far apart they sit — sit at the top of the tab, in that order, under one
 * plain-language sentence saying what the block is doing right now.
 *
 * WHAT MOVED, AND WHAT DID NOT
 *   - Direction / gap / alignment were already here, as four equal chips in a
 *     two-by-two grid beside "Display mode" and "HTML tag". They are now the
 *     primary group and the rest is below them.
 *   - Wrap and justification were NOT here at all. The only way to reach them
 *     was the Style tab's Advanced group, inside a collapsed block called
 *     "Layout (children)". They write the same `style.flexWrap` /
 *     `style.justifyContent` the Style tab writes, through the same viewport
 *     router, so the two tabs cannot disagree.
 *   - Gap now uses the shared `ScaleStepper` over the renderer's own
 *     `GAP_BY_SIZE`, not a second scale and not a second stepper.
 *
 * Nothing is removed and nothing is gated. This is ordering and emphasis.
 */

import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { ScaleStepper } from "../field-kit/scale-stepper";
import { GAP_PRESETS } from "../field-kit/preset-values";
import type { FieldValue } from "../field-kit/preset-state";
import { INSPECTOR_HELP_TEXT_CLASS as HINT } from "../kit/inspector-ui";
import { useInspectorT } from "../kit/use-inspector-t";
import {
  BUILDER_NODE_FLEX_WRAP_OPTIONS,
  BUILDER_NODE_JUSTIFY_CONTENT_OPTIONS,
} from "../style-panel/style-options";
import { NODE_ALIGN_OPTIONS, NODE_LAYOUT_OPTIONS } from "./node-layout-options";
import { describeStack, fillClause, type StackShape } from "./stack-model";

/** The sentence above the controls: what this block is doing, in words. */
export function StackSummary({ shape }: { shape: StackShape }) {
  const { t } = useInspectorT();
  const clauses = describeStack(shape);
  return (
    <div
      data-builder-stack-summary=""
      className="rounded-md px-2.5 py-1.5"
      style={{
        background: CHROME.paper,
        border: `1px solid ${CHROME.line}`,
      }}
    >
      <span className="text-[11px] leading-[1.35]" style={{ color: CHROME.text }}>
        {clauses.map((clause) => fillClause(t(clause.key), clause.vars)).join(", ")}
      </span>
    </div>
  );
}

export interface StackGroupProps {
  /** Direction chip value for the active tier ("" when inherited). */
  directionValue: string;
  onDirectionChange: (next: string) => void;
  directionLabel: React.ReactNode;

  /** Cross-axis alignment (the container `align` prop). */
  alignValue: string;
  onAlignChange: (next: string) => void;
  alignLabel: React.ReactNode;

  /** Gap, as a field-kit value over the renderer's GAP_BY_SIZE. */
  gapValue: FieldValue;
  onGapChange: (next: FieldValue) => void;
  gapLabel: React.ReactNode;

  /**
   * Wrap + justification. Absent when the node kind has no flex children to
   * distribute, or when the active tier has no lane for a style key.
   */
  flow?: {
    wrapValue: string;
    onWrapChange: (next: string) => void;
    wrapLabel: React.ReactNode;
    justifyValue: string;
    onJustifyChange: (next: string) => void;
    justifyLabel: React.ReactNode;
    /** Set when the tier has no lane for these; they are replaced by the note. */
    unavailableNote?: string;
  };
}

export function StackGroup({
  directionValue,
  onDirectionChange,
  directionLabel,
  alignValue,
  onAlignChange,
  alignLabel,
  gapValue,
  onGapChange,
  gapLabel,
  flow,
}: StackGroupProps) {
  const { t } = useInspectorT();
  return (
    <div className="flex flex-col gap-2.5" data-builder-stack-group="">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          {directionLabel}
          <Segmented
            fullWidth
            compact
            value={directionValue}
            onChange={onDirectionChange}
            options={NODE_LAYOUT_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          {gapLabel}
          <ScaleStepper
            label=""
            ariaLabel="Gap"
            presets={GAP_PRESETS}
            value={gapValue}
            onChange={onGapChange}
            placeholder="Inherit"
            dataControl="node-gap"
          />
        </div>
      </div>

      {flow && !flow.unavailableNote ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5" data-builder-stack-control="wrap">
            {flow.wrapLabel}
            <Segmented
              fullWidth
              compact
              value={flow.wrapValue}
              onChange={flow.onWrapChange}
              options={BUILDER_NODE_FLEX_WRAP_OPTIONS}
            />
          </div>
          <div className="flex flex-col gap-1.5" data-builder-stack-control="justify">
            {flow.justifyLabel}
            <Segmented
              fullWidth
              compact
              value={flow.justifyValue}
              onChange={flow.onJustifyChange}
              options={BUILDER_NODE_JUSTIFY_CONTENT_OPTIONS}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {alignLabel}
        <Segmented
          fullWidth
          compact
          value={alignValue}
          onChange={onAlignChange}
          options={NODE_ALIGN_OPTIONS}
        />
      </div>

      {flow?.unavailableNote ? (
        <span className={HINT}>{t(flow.unavailableNote)}</span>
      ) : null}
    </div>
  );
}
