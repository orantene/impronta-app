"use client";

/**
 * StylePanel · the PER-SIDE padding and margin boxes.
 *
 * WHAT CHANGED, and why. These eight fields used to be eight bare number
 * inputs. They were the only spacing controls in the panel with no scale in
 * sight, so the fast move was to type a number — and a typed number is how
 * `paddingTop: "120px"` ends up on a page whose scale tops out at 96.
 *
 * Now each side leads with a `ScaleStepper` walking the renderer's own
 * `NODE_SPACING`, and the exact numbers live one level down behind "Exact
 * values". Nothing was removed: the same `NumberUnit` grid, with the same
 * units and the same writes, is inside that expander.
 *
 * THE EXPANDER OPENS ITSELF over a design that is already off-scale. A tenant
 * page full of hand-authored lengths shows those lengths, in the exact input,
 * the moment the panel opens. The alternative — a tidy row of step names over
 * values nobody chose — is the panel lying about the page, and the one outcome
 * this feature must never produce is a saved design quietly re-stated as
 * something else.
 */

import { useState, type ReactNode } from "react";

import { NumberUnit, formatLength } from "../../kit/number-unit";
import { CHROME } from "../../kit/tokens";
import { ScaleStepper } from "../field-kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";
import { useInspectorT } from "../kit/use-inspector-t";
import { parseCssLength } from "./length-utils";
import {
  MARGIN_SIDES,
  PADDING_SIDES,
  SPACING_SIDE_PRESETS,
  hasOffScaleSide,
  spacingSideBoundLabel,
  spacingSidePatch,
  spacingSideValue,
  type SpacingSide,
} from "./spacing-side-fields";
import { ThemeBindRow } from "./section-shared";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";

export interface SpacingSidesProps {
  patchSelectedStandaloneStyle: (patch: Partial<BuilderNodeStyleValue>) => void;
  selectedStandaloneViewportStyle: BuilderNodeStyleValue | undefined;
}

interface SideGroupProps extends SpacingSidesProps {
  title: string;
  hint: string;
  sides: ReadonlyArray<SpacingSide>;
  dataControl: string;
  /** Rendered above the steppers. The padding box uses it for its theme binding. */
  children?: ReactNode;
}

function SpacingSideGroup({
  title,
  hint,
  sides,
  dataControl,
  children,
  patchSelectedStandaloneStyle,
  selectedStandaloneViewportStyle,
}: SideGroupProps) {
  const { t } = useInspectorT();
  const raws = sides.map(
    (side) =>
      (selectedStandaloneViewportStyle as Record<string, unknown> | undefined)?.[
        side.key
      ] as string | undefined,
  );
  const offScale = hasOffScaleSide(raws);
  // `null` = follow the honesty default (open over an off-scale design). An
  // explicit toggle wins from then on, in both directions.
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = expandedOverride ?? offScale;

  return (
    <div
      className="flex flex-col gap-2"
      data-builder-node-style-control={dataControl}
    >
      <span className={FIELD_LABEL}>{t(title)}</span>
      {children}
      <div className="grid grid-cols-2 gap-2">
        {sides.map((side, index) => (
          <ScaleStepper
            key={side.key}
            label={side.label}
            dataControl={side.key}
            presets={SPACING_SIDE_PRESETS}
            boundLabel={spacingSideBoundLabel(raws[index])}
            value={spacingSideValue(raws[index])}
            onChange={(next) =>
              patchSelectedStandaloneStyle(
                spacingSidePatch(side.key, next) as Partial<BuilderNodeStyleValue>,
              )
            }
          />
        ))}
      </div>
      {offScale ? (
        <span
          data-field-kit-custom=""
          style={{ fontSize: 10.5, fontWeight: 500, color: CHROME.accent }}
        >
          {t("Custom value")}
        </span>
      ) : null}
      <button
        type="button"
        data-builder-node-style-control={`${dataControl}-exact-toggle`}
        aria-expanded={expanded}
        onClick={() => setExpandedOverride(!expanded)}
        className="cursor-pointer self-start text-[10px] font-semibold uppercase tracking-[0.10em]"
        style={{ background: "transparent", border: "none", color: CHROME.muted, padding: 0 }}
      >
        {expanded ? t("Hide exact values") : t("Exact values")}
      </button>
      {expanded ? (
        <>
          <span style={{ fontSize: 10.5, color: CHROME.muted2 }}>{t(hint)}</span>
          <div className="grid grid-cols-2 gap-2">
            {sides.map((side, index) => (
              <div key={side.key} className="flex flex-col gap-1">
                <span className="text-[11px]" style={{ color: CHROME.muted }}>
                  {t(side.label)}
                </span>
                <NumberUnit
                  units={["px", "%", "rem"]}
                  defaultUnit="px"
                  placeholder="Auto"
                  value={parseCssLength(raws[index])}
                  onChange={(next) =>
                    patchSelectedStandaloneStyle({
                      [side.key]: next ? formatLength(next) : undefined,
                    } as Partial<BuilderNodeStyleValue>)
                  }
                />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The padding box: four steppers, the theme binding, and the exact escape. */
export function PaddingSidesGroup(props: SpacingSidesProps) {
  return (
    <SpacingSideGroup
      {...props}
      title="Padding sides"
      hint="Any CSS length works here. Values off the scale stay exactly as you type them."
      sides={PADDING_SIDES}
      dataControl="exactPadding"
    >
      {/* Bind all four padding sides to the theme spacing rhythm in one move
          (or detach back to raw). Reads/writes paddingTop as the representative
          side; applies the same value to all sides. */}
      <ThemeBindRow
        prop="paddingTop"
        value={props.selectedStandaloneViewportStyle?.paddingTop}
        onSet={(sentinel) =>
          props.patchSelectedStandaloneStyle({
            paddingTop: sentinel,
            paddingRight: sentinel,
            paddingBottom: sentinel,
            paddingLeft: sentinel,
          })
        }
        onDetach={() =>
          props.patchSelectedStandaloneStyle({
            paddingTop: undefined,
            paddingRight: undefined,
            paddingBottom: undefined,
            paddingLeft: undefined,
          })
        }
      />
    </SpacingSideGroup>
  );
}

/** The margin box. Same shape, the four `*Free` keys. */
export function MarginSidesGroup(props: SpacingSidesProps) {
  return (
    <SpacingSideGroup
      {...props}
      title="Margin sides"
      hint="Any CSS length works here. Values off the scale stay exactly as you type them."
      sides={MARGIN_SIDES}
      dataControl="exactMargin"
    />
  );
}
