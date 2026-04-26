"use client";

/** Phase 3 — auto-bound editor. */
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { blogDetailSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { BlogDetailV1 } from "./schema";

export function BlogDetailEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<BlogDetailV1>) {
  const value: BlogDetailV1 = {
    category: initial.category ?? "Field notes",
    date: initial.date ?? "April 2026",
    title: initial.title ?? "An untitled post",
    byline: initial.byline ?? "By the studio",
    heroImageUrl: initial.heroImageUrl,
    heroImageAlt: initial.heroImageAlt ?? "",
    body: initial.body ?? "First paragraph.\n\nSecond paragraph.",
    pullQuote: initial.pullQuote ?? "",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={blogDetailSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<BlogDetailV1>) })}
        tenantId={tenantId}
        sectionTypeKey="blog_detail"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
