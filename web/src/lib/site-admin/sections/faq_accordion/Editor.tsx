"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { faqAccordionSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { FaqAccordionV1 } from "./schema";

export function FaqAccordionEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<FaqAccordionV1>) {
  const value: FaqAccordionV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    intro: initial.intro ?? "",
    items:
      initial.items ??
      [
        { question: "What's included in a booking?", answer: "All sessions include scouting, scheduling, and a single revision round." },
        { question: "How quickly can you respond?", answer: "Inquiries are answered within 24 business hours." },
        { question: "Do you travel?", answer: "Yes — domestic and international, costs billed at cost." },
      ],
    variant: initial.variant ?? "bordered",
    defaultOpen: initial.defaultOpen ?? -1,
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={faqAccordionSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<FaqAccordionV1>) })}
        tenantId={tenantId}
        sectionTypeKey="faq_accordion" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
