"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import type { SectionEditorProps } from "../types";
import type { PressStripV1, PressStripItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function PressStripEditor({
  initial,
  onChange,
}: SectionEditorProps<PressStripV1>) {
  const value: PressStripV1 = {
    eyebrow: initial.eyebrow ?? "As seen in",
    items:
      initial.items ??
      [
        { name: "Vogue" },
        { name: "Brides" },
        { name: "Harper's Bazaar" },
      ],
    variant: initial.variant ?? "text-italic-serif",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<PressStripV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<PressStripItem>) =>
    patch({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow (optional)</span>
          <input
            className={INPUT}
            maxLength={60}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Variant</span>
          <select
            className={INPUT}
            value={value.variant}
            onChange={(e) =>
              patch({ variant: e.target.value as PressStripV1["variant"] })
            }
          >
            <option value="text-italic-serif">Text (italic serif)</option>
            <option value="logo-row">Logo row</option>
            <option value="mixed">Mixed (logo if set, else name)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Publications ({value.items.length} / 12)</span>
          <button
            type="button"
            disabled={value.items.length >= 12}
            onClick={() => patch({ items: [...value.items, { name: "New" }] })}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
          >
            <input
              className={INPUT}
              placeholder="Name"
              value={item.name}
              onChange={(e) => patchItem(i, { name: e.target.value })}
            />
            <input
              className={INPUT}
              placeholder="Logo URL (optional)"
              value={item.logoUrl ?? ""}
              onChange={(e) =>
                patchItem(i, { logoUrl: e.target.value || undefined })
              }
            />
            <button
              type="button"
              disabled={value.items.length <= 1}
              onClick={() => patch({ items: value.items.filter((_, j) => j !== i) })}
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
        hideAlign
      />
    </div>
  );
}
