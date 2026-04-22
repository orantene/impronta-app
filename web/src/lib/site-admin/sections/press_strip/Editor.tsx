"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { MediaPicker } from "../shared/MediaPicker";
import type { SectionEditorProps } from "../types";
import type { PressStripV1, PressStripItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function PressStripEditor({
  initial,
  onChange,
  tenantId,
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
      <label className={FIELD}>
        <span className={LABEL}>Eyebrow (optional)</span>
        <input
          className={INPUT}
          maxLength={60}
          value={value.eyebrow ?? ""}
          onChange={(e) => patch({ eyebrow: e.target.value })}
        />
      </label>

      <VariantPicker
        name="press_strip.variant"
        legend="Variant"
        sectionKey="press_strip"
        options={[
          { value: "text-italic-serif", label: "Text (italic serif)", hint: "Publication names in serif italic.", schematic: "row" },
          { value: "logo-row", label: "Logo row", hint: "Uploaded publication logos.", schematic: "row" },
          { value: "mixed", label: "Mixed", hint: "Logo when set, else name.", schematic: "row" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

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
            <div className="flex items-center gap-2">
              <input
                className={`${INPUT} flex-1`}
                placeholder="Logo URL (optional)"
                value={item.logoUrl ?? ""}
                onChange={(e) =>
                  patchItem(i, { logoUrl: e.target.value || undefined })
                }
              />
              {tenantId ? (
                <MediaPicker
                  tenantId={tenantId}
                  onPick={(url) => patchItem(i, { logoUrl: url })}
                  label=""
                />
              ) : null}
            </div>
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
