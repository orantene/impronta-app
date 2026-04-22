"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import type { SectionEditorProps } from "../types";
import type {
  ImageCopyAlternatingV1,
  ImageCopyAlternatingItem,
} from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function ImageCopyAlternatingEditor({
  initial,
  onChange,
}: SectionEditorProps<ImageCopyAlternatingV1>) {
  const value: ImageCopyAlternatingV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items: initial.items ?? [
      { title: "Service one", italicTagline: "Long-wear, luminous.", body: "", side: "auto" },
    ],
    variant: initial.variant ?? "editorial-alternating",
    gap: initial.gap ?? "airy",
    imageRatio: initial.imageRatio ?? "5/6",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<ImageCopyAlternatingV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<ImageCopyAlternatingItem>) =>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Variant</span>
          <select
            className={INPUT}
            value={value.variant}
            onChange={(e) =>
              patch({ variant: e.target.value as ImageCopyAlternatingV1["variant"] })
            }
          >
            <option value="editorial-alternating">Editorial alternating</option>
            <option value="info-forward">Info forward</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Gap</span>
          <select
            className={INPUT}
            value={value.gap}
            onChange={(e) => patch({ gap: e.target.value as ImageCopyAlternatingV1["gap"] })}
          >
            <option value="tight">Tight</option>
            <option value="standard">Standard</option>
            <option value="airy">Airy</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Image ratio</span>
          <select
            className={INPUT}
            value={value.imageRatio}
            onChange={(e) =>
              patch({ imageRatio: e.target.value as ImageCopyAlternatingV1["imageRatio"] })
            }
          >
            <option value="4/5">Portrait 4:5</option>
            <option value="5/6">Portrait 5:6 (editorial)</option>
            <option value="3/4">Portrait 3:4</option>
            <option value="1/1">Square 1:1</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Rows ({value.items.length} / 12)</span>
          <button
            type="button"
            disabled={value.items.length >= 12}
            onClick={() =>
              patch({
                items: [...value.items, { title: "New row", side: "auto" }],
              })
            }
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add row
          </button>
        </div>
        {value.items.map((item, i) => (
          <details
            key={i}
            className="rounded-md border border-border/60 bg-muted/30 p-3"
          >
            <summary className="cursor-pointer select-none text-sm font-medium">
              Row {i + 1}: {item.title || "(untitled)"}
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                className={INPUT}
                placeholder="Eyebrow"
                value={item.eyebrow ?? ""}
                onChange={(e) => patchItem(i, { eyebrow: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder="Title"
                value={item.title}
                onChange={(e) => patchItem(i, { title: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder="Italic tagline"
                value={item.italicTagline ?? ""}
                onChange={(e) => patchItem(i, { italicTagline: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder="Image URL"
                value={item.imageUrl ?? ""}
                onChange={(e) =>
                  patchItem(i, { imageUrl: e.target.value || undefined })
                }
              />
              <textarea
                className={`${INPUT} md:col-span-2 min-h-[68px]`}
                placeholder="Body copy"
                value={item.body ?? ""}
                onChange={(e) => patchItem(i, { body: e.target.value })}
              />
              <label className={FIELD}>
                <span className={LABEL}>Image side</span>
                <select
                  className={INPUT}
                  value={item.side}
                  onChange={(e) =>
                    patchItem(i, { side: e.target.value as ImageCopyAlternatingItem["side"] })
                  }
                >
                  <option value="auto">Auto (alternates)</option>
                  <option value="image-left">Image left</option>
                  <option value="image-right">Image right</option>
                </select>
              </label>
              <label className={FIELD}>
                <span className={LABEL}>"Ideal for" items (comma-separated)</span>
                <input
                  className={INPUT}
                  placeholder="Ceremonies, Editorial previews, Getting-ready"
                  value={(item.listItems ?? []).join(", ")}
                  onChange={(e) =>
                    patchItem(i, {
                      listItems: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              disabled={value.items.length <= 1}
              onClick={() =>
                patch({ items: value.items.filter((_, j) => j !== i) })
              }
              className="mt-3 rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
            >
              Remove row
            </button>
          </details>
        ))}
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
