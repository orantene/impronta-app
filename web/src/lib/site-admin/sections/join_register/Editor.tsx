"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { joinRegisterSchemaV1, type JoinRegisterV1 } from "./schema";
import type { SectionEditorProps } from "../types";

export function JoinRegisterEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<JoinRegisterV1>) {
  const value: JoinRegisterV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Join our roster",
    copy: initial.copy ?? "",
    ctaLabel: initial.ctaLabel ?? "",
    variant: initial.variant ?? "card",
    align: initial.align ?? "center",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={joinRegisterSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<JoinRegisterV1>) })}
        tenantId={tenantId}
        sectionTypeKey="join_register"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
