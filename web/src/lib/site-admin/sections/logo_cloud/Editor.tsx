"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { logoCloudSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { LogoCloudV1 } from "./schema";

export function LogoCloudEditor({ initial, onChange, tenantId }: SectionEditorProps<LogoCloudV1>) {
  const value: LogoCloudV1 = {
    eyebrow: initial.eyebrow ?? "Trusted by",
    headline: initial.headline ?? "",
    // Default to no logos — the section renders nothing until the operator adds
    // real partner logos. No placeholder/stock imagery (placehold.co).
    logos: initial.logos ?? [],
    columnsDesktop: initial.columnsDesktop ?? 6,
    variant: initial.variant ?? "muted",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm schema={logoCloudSchemaV1} value={value} onChange={(next) => onChange({ ...value, ...(next as Partial<LogoCloudV1>) })} tenantId={tenantId} sectionTypeKey="logo_cloud" excludeKeys={["presentation"]} />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
