"use client";

/**
 * Phase 3 — auto-bound editor (see ZodSchemaForm).
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { marqueeSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { MarqueeV1 } from "./schema";

export function MarqueeEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<MarqueeV1>) {
  const value: MarqueeV1 = {
    items:
      initial.items ??
      [
        { text: "Press feature one" },
        { text: "Press feature two" },
        { text: "Press feature three" },
      ],
    speed: initial.speed ?? "medium",
    direction: initial.direction ?? "left",
    separator: initial.separator ?? "dot",
    variant: initial.variant ?? "text",
    presentation: initial.presentation,
  };

  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={marqueeSchemaV1}
        value={value}
        onChange={(next) =>
          onChange({ ...value, ...(next as Partial<MarqueeV1>) })
        }
        tenantId={tenantId}
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
