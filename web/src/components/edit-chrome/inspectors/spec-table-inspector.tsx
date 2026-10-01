/**
 * Content inspector for the `spec_table` block: heading plus label/value rows.
 * Every row the renderer reads (label, value) has a control here.
 */
"use client";

import type { ReactNode } from "react";

import { SPEC_TABLE_ROWS_MAX } from "@/lib/site-admin/builder-node/spec-table-defaults";
import type { BuilderSpecTableNode } from "@/lib/site-admin/builder-node/types";

import { KIT, InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;
type Row = { label: string; value: string };

function Section({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>{info ? <InspectorLabelWithInfo label={title} info={info} /> : title}</h3>
      {children}
    </section>
  );
}

export function SpecTableContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderSpecTableNode;
  commitPatch: CommitPatch;
}) {
  const p = node.props;
  const rows: Row[] = (p.rows ?? []).map((r) => ({ label: r.label ?? "", value: r.value ?? "" }));
  const patchRows = (next: Row[]) =>
    commitPatch({
      rows: next.slice(0, SPEC_TABLE_ROWS_MAX).map((r) => ({ label: r.label.slice(0, 60), value: r.value.slice(0, 200) })),
    });
  const setRow = (i: number, patch: Partial<Row>) => patchRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div
      className="flex flex-col gap-4"
      data-builder-node-content-panel="spec_table"
      data-spec-table-inspector="content"
    >
      <Section
        title="Content"
        info="A short table of facts. On a phone it is stacked rows; on a desktop it becomes one strip with a column per row."
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            className={KIT.input}
            value={p.eyebrow ?? ""}
            placeholder="Optional"
            onChange={(e) => commitPatch({ eyebrow: e.target.value })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Heading</label>
          <input
            className={KIT.input}
            value={p.title ?? ""}
            placeholder="Optional"
            onChange={(e) => commitPatch({ title: e.target.value })}
          />
        </div>
      </Section>
      <Section title="Rows" info="Rows with an empty label or value are not shown.">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-md border border-stone-200 p-2">
            <input
              className={KIT.input}
              aria-label="Row label"
              value={r.label}
              placeholder="Label (Warranty)"
              onChange={(e) => setRow(i, { label: e.target.value })}
            />
            <input
              className={KIT.input}
              aria-label="Row value"
              value={r.value}
              placeholder="Value (6 months, in writing)"
              onChange={(e) => setRow(i, { value: e.target.value })}
            />
            <button
              type="button"
              className="self-start text-[12px] text-stone-600 underline"
              onClick={() => patchRows(rows.filter((_, j) => j !== i))}
            >
              Remove row
            </button>
          </div>
        ))}
        {rows.length < SPEC_TABLE_ROWS_MAX ? (
          <button
            type="button"
            className="self-start rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] text-stone-700"
            onClick={() => patchRows([...rows, { label: "", value: "" }])}
          >
            Add row
          </button>
        ) : null}
      </Section>
    </div>
  );
}
