"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { imageOrbitSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { ImageOrbitV1 } from "./schema";

export function ImageOrbitEditor({ initial, onChange, tenantId }: SectionEditorProps<ImageOrbitV1>) {
  const value: ImageOrbitV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    imageUrl: initial.imageUrl ?? "https://images.unsplash.com/photo-1519741497674-611481863552",
    imageAlt: initial.imageAlt ?? "",
    tags: initial.tags ?? [
      { x: 25, y: 30, label: "First detail", detail: "What this part is." },
      { x: 70, y: 50, label: "Second detail", detail: "Why it matters." },
      { x: 40, y: 75, label: "Third detail" },
    ],
    ratio: initial.ratio ?? "4/3",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm schema={imageOrbitSchemaV1} value={value} onChange={(next) => onChange({ ...value, ...(next as Partial<ImageOrbitV1>) })} tenantId={tenantId} sectionTypeKey="image_orbit" excludeKeys={["presentation"]} />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
