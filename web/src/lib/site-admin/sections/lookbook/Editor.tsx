"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { lookbookSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { LookbookV1 } from "./schema";

export function LookbookEditor({ initial, onChange, tenantId }: SectionEditorProps<LookbookV1>) {
  const value: LookbookV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    pages: initial.pages ?? [
      { imageUrl: "https://images.unsplash.com/photo-1519741497674-611481863552", alt: "" },
      { imageUrl: "https://images.unsplash.com/photo-1519225421980-715cb0215aed", alt: "" },
      { imageUrl: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3", alt: "" },
      { imageUrl: "https://images.unsplash.com/photo-1519741497674-611481863552", alt: "" },
    ],
    variant: initial.variant ?? "spread",
    ratio: initial.ratio ?? "3/4",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm schema={lookbookSchemaV1} value={value} onChange={(next) => onChange({ ...value, ...(next as Partial<LookbookV1>) })} tenantId={tenantId} sectionTypeKey="lookbook" excludeKeys={["presentation"]} />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
