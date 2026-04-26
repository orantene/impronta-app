"use client";
import { PresentationPanel } from "../shared/PresentationPanel";
import { ZodSchemaForm } from "../shared/ZodSchemaForm";
import { donationFormSchemaV1 } from "./schema";
import type { SectionEditorProps } from "../types";
import type { DonationFormV1 } from "./schema";

export function DonationFormEditor({ initial, onChange, tenantId }: SectionEditorProps<DonationFormV1>) {
  const value: DonationFormV1 = {
    eyebrow: initial.eyebrow ?? "Support our work",
    headline: initial.headline ?? "Every contribution counts.",
    intro: initial.intro ?? "Pick an amount or enter your own. All donations are tax-deductible.",
    amounts: initial.amounts ?? [25, 50, 100, 250, 500],
    currency: initial.currency ?? "USD",
    defaultAmountIndex: initial.defaultAmountIndex ?? 1,
    allowCustom: initial.allowCustom ?? true,
    checkoutUrl: initial.checkoutUrl ?? "https://buy.stripe.com/your-link",
    ctaLabel: initial.ctaLabel ?? "Donate",
    trustNote: initial.trustNote ?? "Powered by Stripe — secure encrypted checkout.",
    presentation: initial.presentation,
  };
  return (
    <div className="flex flex-col gap-4">
      <ZodSchemaForm schema={donationFormSchemaV1} value={value} onChange={(next) => onChange({ ...value, ...(next as Partial<DonationFormV1>) })} tenantId={tenantId} sectionTypeKey="donation_form" excludeKeys={["presentation"]} />
      <PresentationPanel value={value.presentation} onChange={(next) => onChange({ ...value, presentation: next })} />
    </div>
  );
}
