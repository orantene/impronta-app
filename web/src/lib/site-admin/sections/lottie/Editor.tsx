"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { lottieSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { LottieV1 } from "./schema";

export function LottieEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<LottieV1>) {
  const value: LottieV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    caption: initial.caption ?? "",
    src: initial.src ?? "https://lottie.host/d7c0c9c4-6e91-4d83-aaf1-8c5c5e4b2d6a/eGD9bN9Yt8.json",
    trigger: initial.trigger ?? "autoplay",
    loop: initial.loop ?? true,
    speed: initial.speed ?? 1,
    ratio: initial.ratio ?? "1/1",
    maxWidth: initial.maxWidth ?? 480,
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={lottieSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<LottieV1>) })}
        tenantId={tenantId}
        sectionTypeKey="lottie"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
