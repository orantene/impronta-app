import type { SectionMeta } from "../types";
export const donationFormMeta: SectionMeta = {
  key: "donation_form",
  label: "Donation form",
  description: "Amount selector, suggested tiers, and a payment link. Operator wires the payment URL (Stripe / Donorbox / etc).",
  businessPurpose: "conversion",
  visibleToAgency: true,
  category: "convert",
  inDefault: false,
};
