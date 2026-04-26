"use client";

/**
 * Phase 3 — auto-bound editor.
 *
 * Note: rows.values is an array-of-strings keyed positionally to
 * columns. ZodSchemaForm renders it as a newline-textarea; the operator
 * adds one value per line in the same order as the columns.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { comparisonTableSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { ComparisonTableV1 } from "./schema";

export function ComparisonTableEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<ComparisonTableV1>) {
  const value: ComparisonTableV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    intro: initial.intro ?? "",
    columns:
      initial.columns ??
      [
        { label: "Half-day", highlighted: false },
        { label: "Full-day", highlighted: true },
        { label: "Destination", highlighted: false },
      ],
    rows:
      initial.rows ??
      [
        { feature: "Hours of coverage", values: ["4", "8", "Multi-day"] },
        { feature: "Pre-day session", values: ["no", "yes", "yes"] },
        { feature: "Edited images", values: ["70+", "200+", "Custom"] },
        { feature: "Travel included", values: ["no", "no", "yes"] },
        { feature: "Revision rounds", values: ["1", "2", "3"] },
      ],
    variant: initial.variant ?? "striped",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={comparisonTableSchemaV1}
        value={value}
        onChange={(next) =>
          onChange({ ...value, ...(next as Partial<ComparisonTableV1>) })
        }
        tenantId={tenantId}
        sectionTypeKey="comparison_table"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
