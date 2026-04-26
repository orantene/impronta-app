"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { MediaPicker } from "../shared/MediaPicker";
import { AltTextField } from "../shared/AltTextField";
import type { SectionEditorProps } from "../types";
import type { BeforeAfterV1 } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT = "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function BeforeAfterEditor({ initial, onChange, tenantId }: SectionEditorProps<BeforeAfterV1>) {
  const value: BeforeAfterV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    beforeUrl: initial.beforeUrl ?? "https://images.unsplash.com/photo-1519741497674-611481863552",
    afterUrl: initial.afterUrl ?? "https://images.unsplash.com/photo-1519225421980-715cb0215aed",
    beforeAlt: initial.beforeAlt ?? "",
    afterAlt: initial.afterAlt ?? "",
    beforeLabel: initial.beforeLabel ?? "Before",
    afterLabel: initial.afterLabel ?? "After",
    initialPosition: initial.initialPosition ?? 50,
    ratio: initial.ratio ?? "16/9",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<BeforeAfterV1>) => onChange({ ...value, ...p });

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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
          <span className={LABEL}>Before image</span>
          <div className="flex items-center gap-2">
            <input className={`${INPUT} flex-1`} placeholder="URL" value={value.beforeUrl} onChange={(e) => patch({ beforeUrl: e.target.value })} />
            {tenantId ? <MediaPicker tenantId={tenantId} onPick={(url) => patch({ beforeUrl: url })} label="" /> : null}
          </div>
          <AltTextField imageUrl={value.beforeUrl} value={value.beforeAlt ?? ""} onChange={(next) => patch({ beforeAlt: next })} />
          <input className={INPUT} placeholder="Label (e.g. Before)" maxLength={40} value={value.beforeLabel} onChange={(e) => patch({ beforeLabel: e.target.value })} />
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
          <span className={LABEL}>After image</span>
          <div className="flex items-center gap-2">
            <input className={`${INPUT} flex-1`} placeholder="URL" value={value.afterUrl} onChange={(e) => patch({ afterUrl: e.target.value })} />
            {tenantId ? <MediaPicker tenantId={tenantId} onPick={(url) => patch({ afterUrl: url })} label="" /> : null}
          </div>
          <AltTextField imageUrl={value.afterUrl} value={value.afterAlt ?? ""} onChange={(next) => patch({ afterAlt: next })} />
          <input className={INPUT} placeholder="Label (e.g. After)" maxLength={40} value={value.afterLabel} onChange={(e) => patch({ afterLabel: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Initial divider position ({value.initialPosition}%)</span>
          <input type="range" min={0} max={100} value={value.initialPosition} onChange={(e) => patch({ initialPosition: Number(e.target.value) })} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Aspect ratio</span>
          <select className={INPUT} value={value.ratio} onChange={(e) => patch({ ratio: e.target.value as BeforeAfterV1["ratio"] })}>
            <option value="16/9">16:9</option>
            <option value="4/3">4:3</option>
            <option value="1/1">1:1</option>
            <option value="5/4">5:4</option>
          </select>
        </label>
      </div>

      <PresentationPanel value={value.presentation} onChange={(next) => patch({ presentation: next })} />
    </div>
  );
}
