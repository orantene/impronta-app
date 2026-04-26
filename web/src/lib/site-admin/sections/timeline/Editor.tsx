"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import type { SectionEditorProps } from "../types";
import type { TimelineV1, TimelineItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT = "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function TimelineEditor({ initial, onChange }: SectionEditorProps<TimelineV1>) {
  const value: TimelineV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items:
      initial.items ??
      [
        { date: "2018", title: "Founded", body: "Three founders, one shared studio." },
        { date: "2021", title: "First international booking", body: "Tulum wedding for a NY couple." },
        { date: "2024", title: "180 cities served", body: "Now booked through 2026." },
      ],
    variant: initial.variant ?? "left-rail",
    numberStyle: initial.numberStyle ?? "dot",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<TimelineV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<TimelineItem>) =>
    patch({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input className={INPUT} maxLength={60} value={value.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value })} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input className={INPUT} maxLength={200} value={value.headline ?? ""} onChange={(e) => patch({ headline: e.target.value })} />
        </label>
      </div>

      <VariantPicker
        name="timeline.variant"
        legend="Variant"
        sectionKey="timeline"
        options={[
          { value: "left-rail", label: "Left rail", hint: "Vertical line on the left.", schematic: "row" },
          { value: "centered", label: "Centered", hint: "Items alternate left/right of a central rail.", schematic: "row" },
          { value: "right-rail", label: "Right rail", hint: "Vertical line on the right.", schematic: "row" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <label className={FIELD}>
        <span className={LABEL}>Marker style</span>
        <select className={INPUT} value={value.numberStyle} onChange={(e) => patch({ numberStyle: e.target.value as TimelineV1["numberStyle"] })}>
          <option value="dot">Dot</option>
          <option value="ring">Ring</option>
          <option value="year">Year inside marker</option>
        </select>
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Items ({value.items.length} / 40)</span>
          <button
            type="button"
            disabled={value.items.length >= 40}
            onClick={() => patch({ items: [...value.items, { date: "—", title: "New milestone" }] })}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_1fr]">
              <input className={INPUT} placeholder="Date" maxLength={40} value={item.date} onChange={(e) => patchItem(i, { date: e.target.value })} />
              <input className={INPUT} placeholder="Title" maxLength={160} value={item.title} onChange={(e) => patchItem(i, { title: e.target.value })} />
            </div>
            <textarea className={INPUT} rows={2} placeholder="Body (optional)" value={item.body ?? ""} onChange={(e) => patchItem(i, { body: e.target.value })} />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={value.items.length <= 1}
                onClick={() => patch({ items: value.items.filter((_, j) => j !== i) })}
                className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
              >
                × Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <PresentationPanel value={value.presentation} onChange={(next) => patch({ presentation: next })} />
    </div>
  );
}
