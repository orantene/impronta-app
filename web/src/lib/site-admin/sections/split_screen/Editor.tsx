"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { LinkPicker } from "../shared/LinkPicker";
import { AltTextField } from "../shared/AltTextField";
import type { SectionEditorProps } from "../types";
import type { SplitScreenV1 } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function SplitScreenEditor({
  initial,
  onChange,
}: SectionEditorProps<SplitScreenV1>) {
  const value: SplitScreenV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Two-up split",
    body: initial.body ?? "",
    primaryCta: initial.primaryCta,
    secondaryCta: initial.secondaryCta,
    imageUrl: initial.imageUrl,
    imageAlt: initial.imageAlt ?? "",
    videoUrl: initial.videoUrl,
    side: initial.side ?? "image-left",
    variant: initial.variant ?? "50-50",
    verticalAlign: initial.verticalAlign ?? "center",
    stickyMedia: initial.stickyMedia ?? false,
    presentation: initial.presentation,
  };
  const patch = (p: Partial<SplitScreenV1>) => onChange({ ...value, ...p });

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
            value={value.headline}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </label>
      </div>
      <label className={FIELD}>
        <span className={LABEL}>Body</span>
        <textarea
          className={INPUT}
          rows={4}
          maxLength={800}
          value={value.body ?? ""}
          onChange={(e) => patch({ body: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Image URL</span>
          <input
            className={INPUT}
            placeholder="https://…"
            value={value.imageUrl ?? ""}
            onChange={(e) =>
              patch({ imageUrl: e.target.value || undefined })
            }
          />
        </label>
        <div className={FIELD}>
          <AltTextField
            imageUrl={value.imageUrl}
            value={value.imageAlt ?? ""}
            onChange={(next) => patch({ imageAlt: next })}
          />
        </div>
        <label className={FIELD}>
          <span className={LABEL}>Video URL (optional, overrides image)</span>
          <input
            className={INPUT}
            placeholder="https://…/video.mp4"
            value={value.videoUrl ?? ""}
            onChange={(e) =>
              patch({ videoUrl: e.target.value || undefined })
            }
          />
        </label>
      </div>

      <VariantPicker
        name="split.variant"
        legend="Column ratio"
        sectionKey="split_screen"
        options={[
          { value: "50-50", label: "50 / 50", hint: "Equal columns.", schematic: "row" },
          { value: "40-60", label: "40 / 60", hint: "Media smaller.", schematic: "row" },
          { value: "60-40", label: "60 / 40", hint: "Media larger.", schematic: "row" },
          { value: "edge-to-edge", label: "Edge to edge", hint: "No container; full bleed media.", schematic: "row" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Side</span>
          <select
            className={INPUT}
            value={value.side}
            onChange={(e) =>
              patch({ side: e.target.value as SplitScreenV1["side"] })
            }
          >
            <option value="image-left">Image left</option>
            <option value="image-right">Image right</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Vertical align</span>
          <select
            className={INPUT}
            value={value.verticalAlign}
            onChange={(e) =>
              patch({
                verticalAlign: e.target
                  .value as SplitScreenV1["verticalAlign"],
              })
            }
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label className={`${FIELD} flex-row items-center gap-2`}>
          <input
            type="checkbox"
            checked={value.stickyMedia}
            onChange={(e) => patch({ stickyMedia: e.target.checked })}
          />
          <span className={LABEL}>Sticky media</span>
        </label>
      </div>

      <fieldset className="rounded-md border border-border/60 p-3">
        <legend className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
          Primary CTA
        </legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            className={INPUT}
            placeholder="Label"
            value={value.primaryCta?.label ?? ""}
            onChange={(e) =>
              patch({
                primaryCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.primaryCta?.href ?? "#",
                    }
                  : undefined,
              })
            }
          />
          <LinkPicker
            value={value.primaryCta?.href ?? ""}
            onChange={(next) =>
              patch({
                primaryCta: value.primaryCta
                  ? { ...value.primaryCta, href: next }
                  : next
                    ? { label: "Learn more", href: next }
                    : undefined,
              })
            }
          />
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-border/60 p-3">
        <legend className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
          Secondary CTA
        </legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            className={INPUT}
            placeholder="Label"
            value={value.secondaryCta?.label ?? ""}
            onChange={(e) =>
              patch({
                secondaryCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.secondaryCta?.href ?? "#",
                    }
                  : undefined,
              })
            }
          />
          <LinkPicker
            value={value.secondaryCta?.href ?? ""}
            onChange={(next) =>
              patch({
                secondaryCta: value.secondaryCta
                  ? { ...value.secondaryCta, href: next }
                  : undefined,
              })
            }
          />
        </div>
      </fieldset>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
