"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { blogIndexSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { BlogIndexV1 } from "./schema";

export function BlogIndexEditor({ initial, onChange, tenantId }: SectionEditorProps<BlogIndexV1>) {
  // Posts v1: live ("Últimos posts") by default; legacy sections that carry a
  // manual list keep it (absent `source` + posts present = manual).
  const source = initial.source ?? (initial.posts && initial.posts.length > 0 ? "manual" : "live");
  const value: BlogIndexV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    source,
    limit: initial.limit ?? 3,
    categorySlug: initial.categorySlug,
    posts: initial.posts,
    variant: initial.variant ?? "cards",
    columnsDesktop: initial.columnsDesktop ?? 3,
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={blogIndexSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<BlogIndexV1>) })}
        tenantId={tenantId}
        sectionTypeKey="blog_index"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
