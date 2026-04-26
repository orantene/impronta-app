"use client";

import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { MediaPicker } from "../shared/MediaPicker";
import { LinkPicker } from "../shared/LinkPicker";
import type {
  DestinationsMosaicV1,
  DestinationsMosaicItem,
} from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function DestinationsMosaicEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<DestinationsMosaicV1>) {
  const value: DestinationsMosaicV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    copy: initial.copy ?? "",
    items: initial.items ?? [
      { label: "Tulum", region: "Quintana Roo" },
      { label: "Los Cabos", region: "Baja California Sur" },
    ],
    footnote: initial.footnote ?? "",
    variant: initial.variant ?? "portrait-mosaic",
    presentation: initial.presentation,
  };

  const patch = (p: Partial<DestinationsMosaicV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<DestinationsMosaicItem>) =>
    patch({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  const addItem = () => {
    if (value.items.length >= 5) return;
    patch({ items: [...value.items, { label: "New destination" }] });
  };
  const removeItem = (i: number) => {
    if (value.items.length <= 2) return;
    patch({ items: value.items.filter((_, j) => j !== i) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input className={INPUT} maxLength={60} value={value.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value })} placeholder="Destinations" />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input className={INPUT} maxLength={200} value={value.headline ?? ""} onChange={(e) => patch({ headline: e.target.value })} />
        </label>
      </div>
      <label className={FIELD}>
        <span className={LABEL}>Copy</span>
        <textarea className={`${INPUT} min-h-[60px]`} maxLength={400} value={value.copy ?? ""} onChange={(e) => patch({ copy: e.target.value })} />
      </label>
      <label className={FIELD}>
        <span className={LABEL}>Italic footnote</span>
        <input className={INPUT} maxLength={200} value={value.footnote ?? ""} onChange={(e) => patch({ footnote: e.target.value })} />
      </label>
      <VariantPicker
        name="destinations_mosaic.variant"
        legend="Variant"
        sectionKey="destinations_mosaic"
        options={[
          { value: "portrait-mosaic", label: "Portrait mosaic", hint: "Hero + 2×2 grid.", schematic: "mosaic" },
          { value: "tile-grid", label: "Tile grid", hint: "Uniform tiles.", schematic: "grid" },
          { value: "map-inspired", label: "Map inspired", hint: "Decorative map-styled.", schematic: "mosaic" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Tiles ({value.items.length} / 5 · first tile renders hero)</span>
          <button type="button" onClick={addItem} disabled={value.items.length >= 5} className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50">+ Add</button>
        </div>
        {value.items.map((item, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <input className={INPUT} placeholder="Label (e.g. Tulum)" maxLength={80} value={item.label} onChange={(e) => patchItem(i, { label: e.target.value })} />
            <input className={INPUT} placeholder="Region" maxLength={80} value={item.region ?? ""} onChange={(e) => patchItem(i, { region: e.target.value })} />
            <input className={INPUT} placeholder="Tagline" maxLength={180} value={item.tagline ?? ""} onChange={(e) => patchItem(i, { tagline: e.target.value })} />
            <button type="button" onClick={() => removeItem(i)} disabled={value.items.length <= 2} className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30">×</button>
            <div className="flex items-center gap-2 md:col-span-4">
              <input
                className={`${INPUT} flex-1`}
                placeholder="Image URL"
                value={item.imageUrl ?? ""}
                onChange={(e) =>
                  patchItem(i, { imageUrl: e.target.value || undefined })
                }
              />
              {tenantId ? (
                <MediaPicker
                  tenantId={tenantId}
                  onPick={(url) => patchItem(i, { imageUrl: url })}
                  label=""
                />
              ) : null}
            </div>
            <div className="md:col-span-4">
              <LinkPicker
                value={item.href ?? ""}
                onChange={(next) => patchItem(i, { href: next || undefined })}
              />
            </div>
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
