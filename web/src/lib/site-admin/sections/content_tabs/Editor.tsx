"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { contentTabsSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { ContentTabsV1 } from "./schema";

export function ContentTabsEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<ContentTabsV1>) {
  const value: ContentTabsV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    tabs:
      initial.tabs ??
      [
        { label: "Approach", body: "How we work, in one paragraph." },
        { label: "Process", body: "Three-step flow from inquiry to wrap." },
        { label: "FAQ", body: "Common questions, short answers." },
      ],
    variant: initial.variant ?? "underline",
    defaultTab: initial.defaultTab ?? 0,
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={contentTabsSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<ContentTabsV1>) })}
        tenantId={tenantId}
        sectionTypeKey="content_tabs" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
