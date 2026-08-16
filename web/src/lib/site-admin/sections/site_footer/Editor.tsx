"use client";

/**
 * Phase B.1 — auto-bound editor for site_footer.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { siteFooterSchemaV1 } from "./schema";
import { withSiteFooterEditorDefaults } from "./editor-value";
import type { SectionEditorProps } from "../types";
import type { SiteFooterV1 } from "./schema";

export function SiteFooterEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<SiteFooterV1>) {
  // F5 — the defaults layer SPREADS `initial` so `nodePresentation` (and any
  // future schema field) survives the `{ ...value, ...next }` merges below.
  // Pure + node-tested in `editor-value.test.ts`.
  const value: SiteFooterV1 = withSiteFooterEditorDefaults(initial);
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
