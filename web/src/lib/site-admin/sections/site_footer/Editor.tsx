"use client";

/**
 * Phase B.1 — auto-bound editor for site_footer.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { siteFooterSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { SiteFooterV1 } from "./schema";

export function SiteFooterEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<SiteFooterV1>) {
  const value: SiteFooterV1 = {
    brand: initial.brand ?? {},
    columns: initial.columns ?? [],
    social: initial.social ?? [],
    legal: initial.legal ?? { links: [] },
    variant: initial.variant ?? "standard",
    tone: initial.tone ?? "follow",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={siteFooterSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<SiteFooterV1>) })}
        tenantId={tenantId}
        sectionTypeKey="site_footer"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
