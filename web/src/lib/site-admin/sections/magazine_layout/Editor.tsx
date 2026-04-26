"use client";

/** Phase 3 — auto-bound editor. */
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { magazineLayoutSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { MagazineLayoutV1 } from "./schema";

export function MagazineLayoutEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<MagazineLayoutV1>) {
  const value: MagazineLayoutV1 = {
    eyebrow: initial.eyebrow ?? "Featured",
    headline: initial.headline ?? "From the studio.",
    hero: initial.hero ?? {
      title: "Headlining post",
      excerpt: "Lead with the most important story.",
      category: "Field notes",
      href: "#",
    },
    secondary:
      initial.secondary ??
      [
        { title: "Secondary post one", excerpt: "Supporting story.", category: "Craft", href: "#" },
        { title: "Secondary post two", excerpt: "Supporting story.", category: "Workflow", href: "#" },
        { title: "Secondary post three", excerpt: "Supporting story.", category: "Field notes", href: "#" },
      ],
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={magazineLayoutSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<MagazineLayoutV1>) })}
        tenantId={tenantId}
        sectionTypeKey="magazine_layout"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
