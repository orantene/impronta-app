"use client";

/**
 * Phase 3 — auto-bound editor.
 */

import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { pricingGridSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { PricingGridV1 } from "./schema";

export function PricingGridEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<PricingGridV1>) {
  const value: PricingGridV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    intro: initial.intro ?? "",
    plans:
      initial.plans ??
      [
        { name: "Essential", price: "$2,400", cadence: "starting at", description: "Half-day coverage.", features: ["Trial session", "4-hour day-of", "Single revision"], ctaLabel: "Inquire", ctaHref: "/contact", highlighted: false },
        { name: "Signature", price: "$4,800", cadence: "starting at", description: "Full-day coverage with extras.", features: ["Trial session", "8-hour day-of", "Travel included", "Two-revision rounds"], ctaLabel: "Inquire", ctaHref: "/contact", highlighted: true, badge: "Most popular" },
        { name: "Destination", price: "Custom", cadence: "scoped per trip", features: ["Trial + planning call", "Full multi-day", "International logistics"], ctaLabel: "Talk to us", ctaHref: "/contact", highlighted: false },
      ],
    variant: initial.variant ?? "cards",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm
        schema={pricingGridSchemaV1}
        value={value}
        onChange={(next) => onChange({ ...value, ...(next as Partial<PricingGridV1>) })}
        tenantId={tenantId}
        sectionTypeKey="pricing_grid" excludeKeys={["presentation"]}
      />
      <PresentationPanel
        value={value.presentation}
        onChange={(next) => onChange({ ...value, presentation: next })}
      />
    </div>
  );
}
