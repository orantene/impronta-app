"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { pressStripSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { PressStripV1 } from "./schema";

export function PressStripEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<PressStripV1>) {
  const value: PressStripV1 = {
    eyebrow: initial.eyebrow ?? "As seen in",
    items:
      initial.items ??
      [
        { name: "Vogue" },
        { name: "Brides" },
        { name: "Harper's Bazaar" },
      ],
    variant: initial.variant ?? "text-italic-serif",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={pressStripSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<PressStripV1>) })}
        tenantId={tenantId}
        sectionTypeKey="press_strip" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
