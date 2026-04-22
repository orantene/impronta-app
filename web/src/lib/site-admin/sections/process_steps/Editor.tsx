"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import type { SectionEditorProps } from "../types";
import type { ProcessStepsV1, ProcessStepsStep } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function ProcessStepsEditor({
  initial,
  onChange,
}: SectionEditorProps<ProcessStepsV1>) {
  const value: ProcessStepsV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    copy: initial.copy ?? "",
    steps:
      initial.steps ??
      [
        { label: "Explore the collective", detail: "Browse curated professionals by service and destination." },
        { label: "Share your event", detail: "Tell us the date, place, and tone." },
        { label: "Receive a curated match", detail: "We hand-select members for your day." },
        { label: "Confirm your team", detail: "Sign one booking; we coordinate the rest." },
      ],
    variant: initial.variant ?? "numbered-column",
    numberStyle: initial.numberStyle ?? "serif-italic",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<ProcessStepsV1>) => onChange({ ...value, ...p });
  const patchStep = (i: number, p: Partial<ProcessStepsStep>) =>
    patch({ steps: value.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });

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
            placeholder="How booking works"
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>
            Headline <em className="text-[10px] normal-case tracking-normal opacity-70">(use {"{accent}…{/accent}"} for italic emphasis)</em>
          </span>
          <input
            className={INPUT}
            maxLength={200}
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
            placeholder="Four calm steps from {accent}first idea{/accent} to the aisle."
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Variant</span>
          <select
            className={INPUT}
            value={value.variant}
            onChange={(e) =>
              patch({ variant: e.target.value as ProcessStepsV1["variant"] })
            }
          >
            <option value="numbered-column">Numbered column</option>
            <option value="horizontal-timeline">Horizontal timeline</option>
            <option value="alternating-image">Alternating image</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Number style</span>
          <select
            className={INPUT}
            value={value.numberStyle}
            onChange={(e) =>
              patch({
                numberStyle: e.target
                  .value as ProcessStepsV1["numberStyle"],
              })
            }
          >
            <option value="serif-italic">Serif italic (editorial)</option>
            <option value="sans-large">Sans large (modern)</option>
            <option value="roman">Roman numerals</option>
            <option value="none">No numbers</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Steps ({value.steps.length} / 6)</span>
          <button
            type="button"
            disabled={value.steps.length >= 6}
            onClick={() =>
              patch({ steps: [...value.steps, { label: "New step" }] })
            }
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.steps.map((step, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
          >
            <input
              className={INPUT}
              placeholder="Label"
              value={step.label}
              onChange={(e) => patchStep(i, { label: e.target.value })}
            />
            <input
              className={INPUT}
              placeholder="Detail"
              value={step.detail ?? ""}
              onChange={(e) => patchStep(i, { detail: e.target.value })}
            />
            <button
              type="button"
              disabled={value.steps.length <= 2}
              onClick={() => patch({ steps: value.steps.filter((_, j) => j !== i) })}
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
