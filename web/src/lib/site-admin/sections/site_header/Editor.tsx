"use client";

/**
 * Phase B.1 — auto-bound editor for site_header.
 *
 * Standard ZodSchemaForm pattern. Phase B.2 will mount this editor on the
 * canvas via the EditShell when the operator selects the header. For now
 * the file ships so the section type is registry-complete; tsc + lint
 * exercise the editor without it being reachable in the live UI yet.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { siteHeaderSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { SiteHeaderV1 } from "./schema";

export function SiteHeaderEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<SiteHeaderV1>) {
  const value: SiteHeaderV1 = {
    brand: initial.brand ?? { href: "/" },
    navItems: initial.navItems ?? [],
    primaryCta: initial.primaryCta,
    sticky: initial.sticky ?? true,
    tone: initial.tone ?? "surface",
    variant: initial.variant ?? "standard",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={siteHeaderSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<SiteHeaderV1>) })}
        tenantId={tenantId}
        sectionTypeKey="site_header"
        excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
