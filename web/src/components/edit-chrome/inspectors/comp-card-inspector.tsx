/**
 * Content inspector for the shared `comp_card` (measure strip) block.
 * Per-measure visibility, labels, order; full-details disclosure toggle.
 */
"use client";

import type { ReactNode } from "react";

import {
  COMP_CARD_DEFAULT_PROPS,
  COMP_CARD_LAYOUTS,
  COMP_CARD_MEASURE_CATALOG,
  COMP_CARD_MEASURES_MAX,
  cloneCompCardDefaultProps,
  type CompCardLayout,
} from "@/lib/site-admin/builder-node/comp-card-defaults";
import type { BuilderCompCardNode } from "@/lib/site-admin/builder-node/types";

import {
  KIT,
  InspectorItemRow,
  InspectorRowDelete,
  DraggableList,
  type DragHandleProps,
} from "./kit";
import { InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

type MeasureRow = NonNullable<BuilderCompCardNode["props"]["measures"]>[number];

function Section({
  title,
  info,
  children,
}: {
  title: string;
  info?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>
        {info ? <InspectorLabelWithInfo label={title} info={info} /> : title}
      </h3>
      {children}
    </section>
  );
}

function normalizeMeasures(raw: MeasureRow[] | undefined): MeasureRow[] {
  const base = (raw ?? cloneCompCardDefaultProps().measures ?? []).map((m) => ({
    fieldKey: m.fieldKey,
    enabled: m.enabled !== false,
    labelEn: (m.labelEn ?? "").slice(0, 40),
    labelEs: (m.labelEs ?? "").slice(0, 40),
    ...(m.unit ? { unit: m.unit.slice(0, 8) } : {}),
  }));
  return base.slice(0, COMP_CARD_MEASURES_MAX);
}

export function CompCardContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderCompCardNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const layout = (p.layout ??
    COMP_CARD_DEFAULT_PROPS.layout ??
    "strip_with_details") as CompCardLayout;
  const showFullDetails = p.showFullDetails !== false;
  const measures = normalizeMeasures(p.measures as MeasureRow[] | undefined);
  const usedKeys = new Set(measures.map((m) => m.fieldKey));
  const addable = COMP_CARD_MEASURE_CATALOG.filter((c) => !usedKeys.has(c.fieldKey));

  const patchMeasures = (next: MeasureRow[]) => {
    commitPatch({ measures: normalizeMeasures(next) });
  };

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="comp_card"
      data-comp-card-inspector="content"
    >
      <Section
        title="Measure strip"
        info="Only fields marked public on the profile appear. Turning a measure off here hides it on the site even if the profile shows it."
      >
        <DraggableList<MeasureRow>
          items={measures}
          keyOf={(m) => m.fieldKey}
          onReorder={(next) => patchMeasures(next)}
        >
          {(m, index, handleProps) => (
            <MeasureEditorRow
              measure={m}
              handleProps={handleProps}
              canRemove={measures.length > 1}
              onChange={(next) => {
                const copy = measures.slice();
                copy[index] = next;
                patchMeasures(copy);
              }}
              onRemove={() => {
                patchMeasures(measures.filter((_, i) => i !== index));
              }}
            />
          )}
        </DraggableList>
        {addable.length > 0 && measures.length < COMP_CARD_MEASURES_MAX ? (
          <label className="mt-1 flex flex-col gap-1 text-[12px] text-stone-700">
            <span>Add measure</span>
            <select
              className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-[13px]"
              value=""
              onChange={(e) => {
                const key = e.target.value;
                const spec = COMP_CARD_MEASURE_CATALOG.find((c) => c.fieldKey === key);
                if (!spec) return;
                patchMeasures([
                  ...measures,
                  {
                    fieldKey: spec.fieldKey,
                    enabled: true,
                    labelEn: spec.labelEn,
                    labelEs: spec.labelEs,
                    ...(spec.unit ? { unit: spec.unit } : {}),
                  },
                ]);
              }}
            >
              <option value="">Choose a field</option>
              {addable.map((c) => (
                <option key={c.fieldKey} value={c.fieldKey}>
                  {c.labelEn}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-[13px] text-stone-800">
          <span>Minimum measures for strip</span>
          <input
            type="number"
            min={0}
            max={12}
            className="w-24 rounded-md border border-stone-300 bg-white px-2 py-1.5"
            value={p.minMeasures ?? COMP_CARD_DEFAULT_PROPS.minMeasures ?? 4}
            onChange={(e) => {
              const n = Number(e.target.value);
              commitPatch({
                minMeasures: Number.isFinite(n)
                  ? Math.max(0, Math.min(12, Math.trunc(n)))
                  : 4,
              });
            }}
          />
          <span className="text-[11px] text-stone-500">
            Below this count the strip hides and the full card (if on) stays.
          </span>
        </label>
      </Section>

      <Section title="Layout">
        <label className="flex flex-col gap-1 text-[13px] text-stone-800">
          <span>Style</span>
          <select
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5"
            value={layout}
            onChange={(e) =>
              commitPatch({ layout: e.target.value as CompCardLayout })
            }
          >
            {COMP_CARD_LAYOUTS.map((l) => (
              <option key={l} value={l}>
                {l === "strip" ? "Strip only" : "Strip with full details"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showFullDetails && layout === "strip_with_details"}
            disabled={layout === "strip"}
            onChange={(e) => commitPatch({ showFullDetails: e.target.checked })}
          />
          <span>Show full comp card disclosure for remaining public fields</span>
        </label>
      </Section>

      <Section title="Copy">
        <label className="flex flex-col gap-1 text-[13px] text-stone-800">
          <span>Eyebrow</span>
          <input
            type="text"
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5"
            value={p.eyebrow ?? ""}
            maxLength={80}
            onChange={(e) => commitPatch({ eyebrow: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-stone-800">
          <span>Title</span>
          <input
            type="text"
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5"
            value={p.title ?? ""}
            maxLength={160}
            placeholder="Optional (leave blank for a bare strip)"
            onChange={(e) => commitPatch({ title: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-stone-800">
          <span>Details summary (EN)</span>
          <input
            type="text"
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5"
            value={p.detailsSummaryEn ?? COMP_CARD_DEFAULT_PROPS.detailsSummaryEn ?? ""}
            maxLength={80}
            onChange={(e) => commitPatch({ detailsSummaryEn: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-stone-800">
          <span>Details summary (ES)</span>
          <input
            type="text"
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5"
            value={p.detailsSummaryEs ?? COMP_CARD_DEFAULT_PROPS.detailsSummaryEs ?? ""}
            maxLength={80}
            onChange={(e) => commitPatch({ detailsSummaryEs: e.target.value })}
          />
        </label>
      </Section>
    </div>
  );
}

function MeasureEditorRow({
  measure,
  handleProps,
  canRemove,
  onChange,
  onRemove,
}: {
  measure: MeasureRow;
  handleProps: DragHandleProps;
  canRemove: boolean;
  onChange: (next: MeasureRow) => void;
  onRemove: () => void;
}) {
  const shortKey = measure.fieldKey.replace(/^physical\./, "");
  return (
    <InspectorItemRow handleProps={handleProps}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[13px] text-stone-800">
          <input
            type="checkbox"
            checked={measure.enabled !== false}
            onChange={(e) => onChange({ ...measure, enabled: e.target.checked })}
          />
          <span className="truncate font-medium">{measure.labelEn || shortKey}</span>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-500">
            {shortKey}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="text"
            className="rounded border border-stone-300 px-1.5 py-1 text-[12px]"
            value={measure.labelEn ?? ""}
            maxLength={40}
            placeholder="Label EN"
            onChange={(e) => onChange({ ...measure, labelEn: e.target.value })}
          />
          <input
            type="text"
            className="rounded border border-stone-300 px-1.5 py-1 text-[12px]"
            value={measure.labelEs ?? ""}
            maxLength={40}
            placeholder="Label ES"
            onChange={(e) => onChange({ ...measure, labelEs: e.target.value })}
          />
        </div>
      </div>
      {canRemove ? <InspectorRowDelete onClick={onRemove} /> : null}
    </InspectorItemRow>
  );
}
