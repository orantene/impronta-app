"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import type { SectionEditorProps } from "../types";
import type { CodeEmbedV1 } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT = "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function CodeEmbedEditor({ initial, onChange }: SectionEditorProps<CodeEmbedV1>) {
  const value: CodeEmbedV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    caption: initial.caption ?? "",
    url: initial.url ?? "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ratio: initial.ratio ?? "16/9",
    title: initial.title ?? "Embedded content",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<CodeEmbedV1>) => onChange({ ...value, ...p });

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

      <label className={FIELD}>
        <span className={LABEL}>Embed URL (HTTPS)</span>
        <input className={INPUT} placeholder="https://www.youtube.com/embed/…" value={value.url} onChange={(e) => patch({ url: e.target.value })} />
        <span className="text-xs text-muted-foreground">
          Allowed: YouTube, Vimeo, Calendly, Spotify, SoundCloud, Loom, Google Maps/Docs, Typeform, Airtable, Figma, Tally, Instagram, TikTok.
        </span>
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Aspect ratio</span>
          <select className={INPUT} value={value.ratio} onChange={(e) => patch({ ratio: e.target.value as CodeEmbedV1["ratio"] })}>
            <option value="16/9">16:9</option>
            <option value="4/3">4:3</option>
            <option value="1/1">1:1</option>
            <option value="9/16">9:16 (Reels / TikTok)</option>
            <option value="3/4">3:4</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Iframe title (a11y)</span>
          <input className={INPUT} maxLength={140} value={value.title} onChange={(e) => patch({ title: e.target.value })} />
        </label>
      </div>

      <label className={FIELD}>
        <span className={LABEL}>Caption (below)</span>
        <input className={INPUT} maxLength={280} value={value.caption ?? ""} onChange={(e) => patch({ caption: e.target.value })} />
      </label>

      <PresentationPanel value={value.presentation} onChange={(next) => patch({ presentation: next })} />
    </div>
  );
}
