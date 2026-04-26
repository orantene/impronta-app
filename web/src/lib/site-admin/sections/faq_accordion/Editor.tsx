"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import type { SectionEditorProps } from "../types";
import type { FaqAccordionV1, FaqAccordionItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function FaqAccordionEditor({
  initial,
  onChange,
}: SectionEditorProps<FaqAccordionV1>) {
  const value: FaqAccordionV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    intro: initial.intro ?? "",
    items:
      initial.items ??
      [
        {
          question: "What's included in a booking?",
          answer:
            "All sessions include scouting, scheduling, and a single revision round.",
        },
        {
          question: "How quickly can you respond?",
          answer: "Inquiries are answered within 24 business hours.",
        },
        {
          question: "Do you travel?",
          answer: "Yes — domestic and international, costs billed at cost.",
        },
      ],
    variant: initial.variant ?? "bordered",
    defaultOpen: initial.defaultOpen ?? -1,
    presentation: initial.presentation,
  };
  const patch = (p: Partial<FaqAccordionV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<FaqAccordionItem>) =>
    patch({
      items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)),
    });

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
      <label className={FIELD}>
        <span className={LABEL}>Intro</span>
        <textarea
          className={INPUT}
          rows={2}
          maxLength={400}
          value={value.intro ?? ""}
          onChange={(e) => patch({ intro: e.target.value })}
        />
      </label>

      <VariantPicker
        name="faq.variant"
        legend="Variant"
        sectionKey="faq_accordion"
        options={[
          { value: "bordered", label: "Bordered", hint: "Hairline dividers between items.", schematic: "row" },
          { value: "minimal", label: "Minimal", hint: "No borders, just spacing.", schematic: "row" },
          { value: "card", label: "Cards", hint: "Each item in its own card.", schematic: "grid" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <label className={FIELD}>
        <span className={LABEL}>
          Default-open item ({value.defaultOpen === -1 ? "none" : `#${value.defaultOpen + 1}`})
        </span>
        <input
          type="number"
          className={INPUT}
          min={-1}
          max={value.items.length - 1}
          value={value.defaultOpen}
          onChange={(e) =>
            patch({
              defaultOpen: Math.max(
                -1,
                Math.min(value.items.length - 1, Number(e.target.value)),
              ),
            })
          }
        />
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Items ({value.items.length} / 20)</span>
          <button
            type="button"
            disabled={value.items.length >= 20}
            onClick={() =>
              patch({
                items: [
                  ...value.items,
                  { question: "New question?", answer: "Answer goes here." },
                ],
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
            className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3"
          >
            <input
              className={INPUT}
              placeholder="Question"
              value={item.question}
              onChange={(e) => patchItem(i, { question: e.target.value })}
            />
            <textarea
              className={INPUT}
              rows={3}
              placeholder="Answer"
              value={item.answer}
              onChange={(e) => patchItem(i, { answer: e.target.value })}
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={value.items.length <= 1}
                onClick={() =>
                  patch({ items: value.items.filter((_, j) => j !== i) })
                }
                className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
              >
                × Remove
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
