"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import type { SectionEditorProps } from "../types";
import type { ValuesTrioV1, ValuesTrioItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function ValuesTrioEditor({
  initial,
  onChange,
}: SectionEditorProps<ValuesTrioV1>) {
  const value: ValuesTrioV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items:
      initial.items ??
      [
        { title: "Principle one", detail: "" },
        { title: "Principle two", detail: "" },
        { title: "Principle three", detail: "" },
      ],
    variant: initial.variant ?? "numbered-cards",
    numberStyle: initial.numberStyle ?? "serif-italic",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<ValuesTrioV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<ValuesTrioItem>) =>
    patch({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });

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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Variant</span>
          <select
            className={INPUT}
            value={value.variant}
            onChange={(e) =>
              patch({ variant: e.target.value as ValuesTrioV1["variant"] })
            }
          >
            <option value="numbered-cards">Numbered cards</option>
            <option value="iconed">Iconed cards</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Number style</span>
          <select
            className={INPUT}
            value={value.numberStyle}
            onChange={(e) =>
              patch({
                numberStyle: e.target.value as ValuesTrioV1["numberStyle"],
              })
            }
          >
            <option value="serif-italic">Serif italic</option>
            <option value="sans-large">Sans large</option>
            <option value="roman">Roman</option>
            <option value="none">No numbers</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Items ({value.items.length} / 5)</span>
          <button
            type="button"
            disabled={value.items.length >= 5}
            onClick={() =>
              patch({ items: [...value.items, { title: "New value" }] })
            }
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)_auto]"
          >
            <input
              className={`${INPUT} w-16`}
              placeholder="#"
              maxLength={10}
              value={item.numberLabel ?? ""}
              onChange={(e) => patchItem(i, { numberLabel: e.target.value })}
            />
            <input
              className={INPUT}
              placeholder="Title"
              value={item.title}
              onChange={(e) => patchItem(i, { title: e.target.value })}
            />
            <input
              className={INPUT}
              placeholder="Detail"
              value={item.detail ?? ""}
              onChange={(e) => patchItem(i, { detail: e.target.value })}
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
