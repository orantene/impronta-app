"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { MediaPicker } from "../shared/MediaPicker";
import { AltTextField } from "../shared/AltTextField";
import type { SectionEditorProps } from "../types";
import type { GalleryStripV1, GalleryStripItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function GalleryStripEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<GalleryStripV1>) {
  const value: GalleryStripV1 = {
    eyebrow: initial.eyebrow ?? "Moments",
    headline: initial.headline ?? "",
    items: initial.items ?? [{ src: "", aspect: "auto" } as GalleryStripItem],
    variant: initial.variant ?? "mosaic",
    caption: initial.caption ?? "",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<GalleryStripV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<GalleryStripItem>) =>
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

      <VariantPicker
        name="gallery_strip.variant"
        legend="Variant"
        sectionKey="gallery_strip"
        options={[
          { value: "mosaic", label: "Mosaic", hint: "Mixed aspect ratios.", schematic: "mosaic" },
          { value: "scroll-rail", label: "Scroll rail", hint: "Horizontal scroll on desktop.", schematic: "carousel" },
          { value: "grid-uniform", label: "Uniform grid", hint: "Consistent tile size.", schematic: "grid" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-1">
        <label className={FIELD}>
          <span className={LABEL}>Italic caption (optional)</span>
          <input
            className={INPUT}
            maxLength={240}
            value={value.caption ?? ""}
            onChange={(e) => patch({ caption: e.target.value })}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Images ({value.items.length} / 16)</span>
          <button
            type="button"
            disabled={value.items.length >= 16}
            onClick={() =>
              patch({
                items: [...value.items, { src: "", aspect: "auto" } as GalleryStripItem],
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
            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,120px)_auto]"
          >
            <div className="flex items-center gap-2">
              <input
                className={`${INPUT} flex-1`}
                placeholder="Image URL"
                value={item.src}
                onChange={(e) => patchItem(i, { src: e.target.value })}
              />
              {tenantId ? (
                <MediaPicker
                  tenantId={tenantId}
                  onPick={(url) => patchItem(i, { src: url })}
                  label=""
                />
              ) : null}
            </div>
            <AltTextField
              imageUrl={item.src}
              value={item.alt ?? ""}
              onChange={(next) => patchItem(i, { alt: next })}
            />
            <select
              className={INPUT}
              value={item.aspect}
              onChange={(e) =>
                patchItem(i, { aspect: e.target.value as GalleryStripItem["aspect"] })
              }
            >
              <option value="auto">Auto</option>
              <option value="wide">Wide (5:3)</option>
              <option value="tall">Tall (3:4)</option>
              <option value="square">Square</option>
            </select>
            <button
              type="button"
              disabled={value.items.length <= 3}
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
