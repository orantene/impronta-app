"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { teamGridSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { TeamGridV1 } from "./schema";

export function TeamGridEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<TeamGridV1>) {
  const value: TeamGridV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    intro: initial.intro ?? "",
    members:
      initial.members ??
      [
        { name: "Alex Rivera", role: "Founder + creative director" },
        { name: "Maya Chen", role: "Head of production" },
        { name: "Jordan Park", role: "Lead photographer" },
      ],
    variant: initial.variant ?? "portrait",
    columnsDesktop: initial.columnsDesktop ?? 3,
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={teamGridSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<TeamGridV1>) })}
        tenantId={tenantId}
        sectionTypeKey="team_grid" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
