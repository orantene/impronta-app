"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { stickyScrollSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { StickyScrollV1 } from "./schema";

export function StickyScrollEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<StickyScrollV1>) {
  const value: StickyScrollV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    imageUrl: initial.imageUrl ?? "https://images.unsplash.com/photo-1519741497674-611481863552",
    imageAlt: initial.imageAlt ?? "",
    blocks:
      initial.blocks ??
      [
        { title: "Step one", body: "Why this matters first." },
        { title: "Step two", body: "What we do next." },
        { title: "Step three", body: "How it ends." },
      ],
    side: initial.side ?? "media-left",
    variant: initial.variant ?? "minimal",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={stickyScrollSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<StickyScrollV1>) })}
        tenantId={tenantId}
        sectionTypeKey="sticky_scroll"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
