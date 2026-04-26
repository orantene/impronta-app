"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { codeEmbedSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { CodeEmbedV1 } from "./schema";

export function CodeEmbedEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<CodeEmbedV1>) {
  const value: CodeEmbedV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    caption: initial.caption ?? "",
    url: initial.url ?? "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ratio: initial.ratio ?? "16/9",
    title: initial.title ?? "Embedded content",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={codeEmbedSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<CodeEmbedV1>) })}
        tenantId={tenantId}
        sectionTypeKey="code_embed" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
