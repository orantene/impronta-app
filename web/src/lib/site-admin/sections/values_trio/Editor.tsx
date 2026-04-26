"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { valuesTrioSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { ValuesTrioV1 } from "./schema";

export function ValuesTrioEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<ValuesTrioV1>) {
  const value: ValuesTrioV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items:
      initial.items ??
      [
        { title: "Principle one", detail: "" },
        { title: "Principle two", detail: "" },
        { title: "Principle three", detail: "" },
      ],
    variant: initial.variant ?? "numbered-cards",
    numberStyle: initial.numberStyle ?? "serif-italic",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={valuesTrioSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<ValuesTrioV1>) })}
        tenantId={tenantId}
        sectionTypeKey="values_trio" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
