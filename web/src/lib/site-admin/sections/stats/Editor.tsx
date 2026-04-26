"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { statsSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { StatsV1 } from "./schema";

export function StatsEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<StatsV1>) {
  const value: StatsV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items:
      initial.items ??
      [
        { value: "12", label: "Years" },
        { value: "180", label: "Cities" },
        { value: "72", label: "NPS score" },
      ],
    variant: initial.variant ?? "row",
    align: initial.align ?? "center",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={statsSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<StatsV1>) })}
        tenantId={tenantId}
        sectionTypeKey="stats" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
