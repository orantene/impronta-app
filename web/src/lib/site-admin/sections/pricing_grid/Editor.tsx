"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { LinkPicker } from "../shared/LinkPicker";
import type { SectionEditorProps } from "../types";
import type { PricingGridV1, PricingPlan } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT = "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function PricingGridEditor({ initial, onChange }: SectionEditorProps<PricingGridV1>) {
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
  const patch = (p: Partial<PricingGridV1>) => onChange({ ...value, ...p });
  const patchPlan = (i: number, p: Partial<PricingPlan>) =>
    patch({ plans: value.plans.map((pl, j) => (j === i ? { ...pl, ...p } : pl)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input className={INPUT} maxLength={60} value={value.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value })} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input className={INPUT} maxLength={200} value={value.headline ?? ""} onChange={(e) => patch({ headline: e.target.value })} />
        </label>
      </div>
      <label className={FIELD}>
        <span className={LABEL}>Intro</span>
        <textarea className={INPUT} rows={2} maxLength={400} value={value.intro ?? ""} onChange={(e) => patch({ intro: e.target.value })} />
      </label>

      <VariantPicker
        name="pricing.variant"
        legend="Variant"
        sectionKey="pricing_grid"
        options={[
          { value: "cards", label: "Cards", hint: "Filled cards.", schematic: "grid" },
          { value: "minimal", label: "Minimal", hint: "Hairline only, transparent.", schematic: "row" },
          { value: "bordered", label: "Bordered", hint: "1px border around each plan.", schematic: "grid" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Plans ({value.plans.length} / 4)</span>
          <button
            type="button"
            disabled={value.plans.length >= 4}
            onClick={() => patch({ plans: [...value.plans, { name: "New plan", price: "$—", features: ["Feature one"], ctaLabel: "Choose", ctaHref: "/contact", highlighted: false }] })}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add plan
          </button>
        </div>
        {value.plans.map((plan, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className={INPUT} placeholder="Plan name" value={plan.name} onChange={(e) => patchPlan(i, { name: e.target.value })} />
              <input className={INPUT} placeholder="Price (e.g. $24/mo)" value={plan.price} onChange={(e) => patchPlan(i, { price: e.target.value })} />
              <input className={INPUT} placeholder="Cadence (per month, starting at…)" value={plan.cadence ?? ""} onChange={(e) => patchPlan(i, { cadence: e.target.value })} />
              <input className={INPUT} placeholder="Badge (optional, e.g. Most popular)" value={plan.badge ?? ""} onChange={(e) => patchPlan(i, { badge: e.target.value || undefined })} />
            </div>
            <textarea className={INPUT} rows={2} placeholder="Short description" value={plan.description ?? ""} onChange={(e) => patchPlan(i, { description: e.target.value })} />
            <textarea
              className={INPUT}
              rows={4}
              placeholder="Features (one per line)"
              value={plan.features.join("\n")}
              onChange={(e) => patchPlan(i, { features: e.target.value.split("\n").map((s) => s.trim()).filter((s) => s) })}
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr]">
              <input className={INPUT} placeholder="CTA label" value={plan.ctaLabel} onChange={(e) => patchPlan(i, { ctaLabel: e.target.value })} />
              <LinkPicker value={plan.ctaHref} onChange={(next) => patchPlan(i, { ctaHref: next })} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={plan.highlighted} onChange={(e) => patchPlan(i, { highlighted: e.target.checked })} />
              <span>Highlight this plan</span>
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={value.plans.length <= 1}
                onClick={() => patch({ plans: value.plans.filter((_, j) => j !== i) })}
                className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
              >
                × Remove plan
              </button>
            </div>
          </div>
        ))}
      </div>

      <PresentationPanel value={value.presentation} onChange={(next) => patch({ presentation: next })} />
    </div>
  );
}
