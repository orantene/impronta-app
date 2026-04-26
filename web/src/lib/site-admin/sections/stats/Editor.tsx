"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import type { SectionEditorProps } from "../types";
import type { StatsV1, StatsItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function StatsEditor({
  initial,
  onChange,
}: SectionEditorProps<StatsV1>) {
  const value: StatsV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items:
      initial.items ??
      [
        { value: "12", label: "Years" },
        { value: "180", label: "Cities" },
        { value: "72", label: "NPS score" },
      ],
    variant: initial.variant ?? "row",
    align: initial.align ?? "center",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<StatsV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<StatsItem>) =>
    patch({
      items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input
            className={INPUT}
            maxLength={60}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input
            className={INPUT}
            maxLength={200}
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </label>
      </div>

      <VariantPicker
        name="stats.variant"
        legend="Variant"
        sectionKey="stats"
        options={[
          { value: "row", label: "Row", hint: "Big numbers in one row.", schematic: "row" },
          { value: "grid", label: "Grid", hint: "2- or 3-column grid.", schematic: "grid" },
          { value: "split", label: "Split", hint: "Headline left, stats right.", schematic: "row" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <label className={FIELD}>
        <span className={LABEL}>Alignment</span>
        <select
          className={INPUT}
          value={value.align}
          onChange={(e) =>
            patch({ align: e.target.value as StatsV1["align"] })
          }
        >
          <option value="center">Center</option>
          <option value="start">Start</option>
        </select>
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Items ({value.items.length} / 6)</span>
          <button
            type="button"
            disabled={value.items.length >= 6}
            onClick={() =>
              patch({
                items: [...value.items, { value: "0", label: "Metric" }],
              })
            }
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
          >
            <input
              className={INPUT}
              placeholder="Value (12, 99%, $4M)"
              maxLength={20}
              value={item.value}
              onChange={(e) => patchItem(i, { value: e.target.value })}
            />
            <input
              className={INPUT}
              placeholder="Label"
              maxLength={80}
              value={item.label}
              onChange={(e) => patchItem(i, { label: e.target.value })}
            />
            <input
              className={INPUT}
              placeholder="Caption (optional)"
              maxLength={140}
              value={item.caption ?? ""}
              onChange={(e) => patchItem(i, { caption: e.target.value })}
            />
            <button
              type="button"
              disabled={value.items.length <= 2}
              onClick={() =>
                patch({ items: value.items.filter((_, j) => j !== i) })
              }
              className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
