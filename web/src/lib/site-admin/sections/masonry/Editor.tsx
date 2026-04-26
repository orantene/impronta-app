"use client";

/** Phase 3 — auto-bound editor. */
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { masonrySchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { MasonryV1 } from "./schema";

export function MasonryEditor({ initial, onChange, tenantId }: SectionEditorProps<MasonryV1>) {
  const value: MasonryV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items:
      initial.items ??
      [
        { src: "https://images.unsplash.com/photo-1519741497674-611481863552", alt: "" },
        { src: "https://images.unsplash.com/photo-1519225421980-715cb0215aed", alt: "" },
        { src: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3", alt: "" },
      ],
    columnsDesktop: initial.columnsDesktop ?? 3,
    gap: initial.gap ?? "standard",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={masonrySchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<MasonryV1>) })}
        tenantId={tenantId}
        sectionTypeKey="masonry"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
