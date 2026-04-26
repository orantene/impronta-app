"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { LinkPicker } from "../shared/LinkPicker";
import type { SectionEditorProps } from "../types";
import type { MarqueeV1, MarqueeItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function MarqueeEditor({
  initial,
  onChange,
}: SectionEditorProps<MarqueeV1>) {
  const value: MarqueeV1 = {
    items:
      initial.items ??
      [
        { text: "Press feature one" },
        { text: "Press feature two" },
        { text: "Press feature three" },
      ],
    speed: initial.speed ?? "medium",
    direction: initial.direction ?? "left",
    separator: initial.separator ?? "dot",
    variant: initial.variant ?? "text",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<MarqueeV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<MarqueeItem>) =>
    patch({
      items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Variant</span>
          <select
            className={INPUT}
            value={value.variant}
            onChange={(e) =>
              patch({ variant: e.target.value as MarqueeV1["variant"] })
            }
          >
            <option value="text">Inline text</option>
            <option value="tags">Pill tags</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Speed</span>
          <select
            className={INPUT}
            value={value.speed}
            onChange={(e) =>
              patch({ speed: e.target.value as MarqueeV1["speed"] })
            }
          >
            <option value="slow">Slow</option>
            <option value="medium">Medium</option>
            <option value="fast">Fast</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Direction</span>
          <select
            className={INPUT}
            value={value.direction}
            onChange={(e) =>
              patch({ direction: e.target.value as MarqueeV1["direction"] })
            }
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Separator</span>
          <select
            className={INPUT}
            value={value.separator}
            onChange={(e) =>
              patch({ separator: e.target.value as MarqueeV1["separator"] })
            }
          >
            <option value="dot">Dot ·</option>
            <option value="slash">Slash /</option>
            <option value="diamond">Diamond ◆</option>
            <option value="none">None</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Items ({value.items.length} / 40)</span>
          <button
            type="button"
            disabled={value.items.length >= 40}
            onClick={() =>
              patch({ items: [...value.items, { text: "New item" }] })
            }
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]"
          >
            <input
              className={INPUT}
              placeholder="Text"
              value={item.text}
              onChange={(e) => patchItem(i, { text: e.target.value })}
            />
            <LinkPicker
              value={item.href ?? ""}
              onChange={(next) => patchItem(i, { href: next || undefined })}
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
