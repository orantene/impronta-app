import type { SectionMeta } from "../types";
export const donationFormMeta: SectionMeta = {
  key: "donation_form",
  label: "Donation form",
  description: "Amount selector + suggested tiers + checkout link. Operator wires the checkout URL (Stripe / Donorbox / etc).",
  businessPurpose: "conversion",
  visibleToAgency: true,
};
