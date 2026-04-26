"use client";

/**
 * Phase 3 — auto-bound editor (see ZodSchemaForm).
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { beforeAfterSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { BeforeAfterV1 } from "./schema";

export function BeforeAfterEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<BeforeAfterV1>) {
  const value: BeforeAfterV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    beforeUrl: initial.beforeUrl ?? "https://images.unsplash.com/photo-1519741497674-611481863552",
    afterUrl: initial.afterUrl ?? "https://images.unsplash.com/photo-1519225421980-715cb0215aed",
    beforeAlt: initial.beforeAlt ?? "",
    afterAlt: initial.afterAlt ?? "",
    beforeLabel: initial.beforeLabel ?? "Before",
    afterLabel: initial.afterLabel ?? "After",
    initialPosition: initial.initialPosition ?? 50,
    ratio: initial.ratio ?? "16/9",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={beforeAfterSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<BeforeAfterV1>) })}
        tenantId={tenantId}
        sectionTypeKey="before_after" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
