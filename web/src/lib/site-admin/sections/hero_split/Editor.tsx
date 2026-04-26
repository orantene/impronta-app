"use client";

/** Phase 3 — auto-bound editor. */
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { heroSplitSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { HeroSplitV1 } from "./schema";

export function HeroSplitEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<HeroSplitV1>) {
  const value: HeroSplitV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Quiet, unhurried, in the same key.",
    subheadline: initial.subheadline ?? "",
    primaryCta: initial.primaryCta,
    secondaryCta: initial.secondaryCta,
    imageUrl: initial.imageUrl ?? "https://images.unsplash.com/photo-1519741497674-611481863552",
    imageAlt: initial.imageAlt ?? "",
    side: initial.side ?? "media-right",
    variant: initial.variant ?? "asymmetric",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={heroSplitSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<HeroSplitV1>) })}
        tenantId={tenantId}
        sectionTypeKey="hero_split"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
