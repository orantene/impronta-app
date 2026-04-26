"use client";

/**
 * Phase 3 — auto-bound editor.
 *
 * The anchor_nav schema is small + uniform (a links array + 3 enums + 1
 * boolean) so it's a clean fit for `<ZodSchemaForm>`. The form renders
 * itself by introspecting the schema; this file is just glue.
 *
 * Compare with sections like `featured_talent` or `hero` which keep
 * hand-written Editors because they need bespoke UX (roster source
 * toggles, slider preview, etc.).
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { anchorNavSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { AnchorNavV1 } from "./schema";

export function AnchorNavEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<AnchorNavV1>) {
  const value: AnchorNavV1 = {
    links:
      initial.links ??
      [
        { label: "About", href: "#about" },
        { label: "Services", href: "#services" },
        { label: "Work", href: "#work" },
        { label: "Contact", href: "#contact" },
      ],
    variant: initial.variant ?? "pills",
    sticky: initial.sticky ?? false,
    align: initial.align ?? "center",
    presentation: initial.presentation,
  };

  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={anchorNavSchemaV1}
        value={value}
        onChange={(next) =>
          onChange({ ...value, ...(next as Partial<AnchorNavV1>) })
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
