"use client";

import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import type { TestimonialsTrioV1, TestimonialsTrioItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function TestimonialsTrioEditor({
  initial,
  onChange,
}: SectionEditorProps<TestimonialsTrioV1>) {
  const value: TestimonialsTrioV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items: initial.items ?? [
      { quote: "Quiet, unhurried, exquisite. They captured every moment." },
    ],
    variant: initial.variant ?? "trio-card",
    defaultAccent: initial.defaultAccent ?? "auto",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<TestimonialsTrioV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<TestimonialsTrioItem>) =>
    patch({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input className={INPUT} maxLength={60} value={value.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value })} placeholder="Couples & planners" />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input className={INPUT} maxLength={200} value={value.headline ?? ""} onChange={(e) => patch({ headline: e.target.value })} placeholder="Words from the people we work for." />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Variant</span>
          <select className={INPUT} value={value.variant} onChange={(e) => patch({ variant: e.target.value as TestimonialsTrioV1["variant"] })}>
            <option value="trio-card">Trio card</option>
            <option value="single-hero">Single hero quote</option>
            <option value="carousel-row">Carousel row</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Default accent</span>
          <select className={INPUT} value={value.defaultAccent} onChange={(e) => patch({ defaultAccent: e.target.value as TestimonialsTrioV1["defaultAccent"] })}>
            <option value="auto">Auto (cycle blush → sage → champagne)</option>
            <option value="blush">Blush</option>
            <option value="sage">Sage</option>
            <option value="champagne">Champagne</option>
            <option value="ivory">Ivory</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Items ({value.items.length} / 4)</span>
          <button
            type="button"
            onClick={() =>
              value.items.length < 4 &&
              patch({ items: [...value.items, { quote: "Add your quote here." }] })
            }
            disabled={value.items.length >= 4}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <textarea
              className={`${INPUT} min-h-[72px]`}
              maxLength={360}
              value={item.quote}
              onChange={(e) => patchItem(i, { quote: e.target.value })}
              placeholder="Quote"
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                className={INPUT}
                placeholder="Author (e.g. Priya & Dev)"
                maxLength={80}
                value={item.author ?? ""}
                onChange={(e) => patchItem(i, { author: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder="Context (e.g. Three-day celebration)"
                maxLength={120}
                value={item.context ?? ""}
                onChange={(e) => patchItem(i, { context: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder="Location (e.g. Amalfi Coast)"
                maxLength={120}
                value={item.location ?? ""}
                onChange={(e) => patchItem(i, { location: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Accent:</span>
                <select
                  className={INPUT}
                  value={item.accent ?? ""}
                  onChange={(e) =>
                    patchItem(i, {
                      accent: (e.target.value || undefined) as TestimonialsTrioItem["accent"],
                    })
                  }
                >
                  <option value="">Use default</option>
                  <option value="blush">Blush</option>
                  <option value="sage">Sage</option>
                  <option value="champagne">Champagne</option>
                  <option value="ivory">Ivory</option>
                </select>
              </label>
              <button
                type="button"
                disabled={value.items.length <= 1}
                onClick={() => patch({ items: value.items.filter((_, j) => j !== i) })}
                className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
              >
                Remove
              </button>
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
