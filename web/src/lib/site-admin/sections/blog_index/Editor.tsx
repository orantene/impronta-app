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
  const value: BlogIndexV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    posts:
      initial.posts ??
      [
        { title: "Behind the camera at three weddings", excerpt: "What the bride sees, and what we see.", date: "Apr 2026", category: "Field notes", href: "#" },
        { title: "How we color-match across cameras", excerpt: "A short guide to consistent skin tones.", date: "Mar 2026", category: "Craft", href: "#" },
        { title: "Why we don't release RAWs", excerpt: "Edits are the product.", date: "Feb 2026", category: "Workflow", href: "#" },
      ],
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
