"use client";

/** Phase 3 — auto-bound editor. */
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { scrollCarouselSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { ScrollCarouselV1 } from "./schema";

export function ScrollCarouselEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<ScrollCarouselV1>) {
  const value: ScrollCarouselV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    slides:
      initial.slides ??
      [
        { imageUrl: "https://images.unsplash.com/photo-1519741497674-611481863552", title: "Slide 1" },
        { imageUrl: "https://images.unsplash.com/photo-1519225421980-715cb0215aed", title: "Slide 2" },
        { imageUrl: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3", title: "Slide 3" },
      ],
    cardWidthVw: initial.cardWidthVw ?? 28,
    showProgress: initial.showProgress ?? true,
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={scrollCarouselSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<ScrollCarouselV1>) })}
        tenantId={tenantId}
        sectionTypeKey="scroll_carousel"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
