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
    logos: initial.logos ?? [
      { imageUrl: "https://placehold.co/160x60/png?text=Logo+1", alt: "Logo 1" },
      { imageUrl: "https://placehold.co/160x60/png?text=Logo+2", alt: "Logo 2" },
      { imageUrl: "https://placehold.co/160x60/png?text=Logo+3", alt: "Logo 3" },
      { imageUrl: "https://placehold.co/160x60/png?text=Logo+4", alt: "Logo 4" },
    ],
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
