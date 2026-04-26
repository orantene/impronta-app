"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { timelineSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { TimelineV1 } from "./schema";

export function TimelineEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<TimelineV1>) {
  const value: TimelineV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items:
      initial.items ??
      [
        { date: "2018", title: "Founded", body: "Three founders, one shared studio." },
        { date: "2021", title: "First international booking", body: "Tulum wedding for a NY couple." },
        { date: "2024", title: "180 cities served" },
      ],
    variant: initial.variant ?? "left-rail",
    numberStyle: initial.numberStyle ?? "dot",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={timelineSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<TimelineV1>) })}
        tenantId={tenantId}
        sectionTypeKey="timeline" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
