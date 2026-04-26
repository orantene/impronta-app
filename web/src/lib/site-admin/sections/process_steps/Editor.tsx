"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { processStepsSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { ProcessStepsV1 } from "./schema";

export function ProcessStepsEditor({
  initial,
  onChange,
  tenantId,
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
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={processStepsSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<ProcessStepsV1>) })}
        tenantId={tenantId}
        sectionTypeKey="process_steps" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
