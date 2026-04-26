import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

export const donationFormSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  /** Suggested amounts shown as quick-pick chips. */
  amounts: z.array(z.number().positive().max(100000)).min(2).max(8),
  currency: z.string().min(1).max(8).default("USD"),
  /** Default selected amount index. */
  defaultAmountIndex: z.number().int().min(0).max(7).default(1),
  allowCustom: z.boolean().default(true),
  /** Checkout URL the form posts to (operator wires Stripe Payment Link / Donorbox / etc).
   * The amount is appended as `?amount=<value>` (or substituted into `{amount}`). */
  checkoutUrl: z.string().url().max(500),
  ctaLabel: z.string().min(1).max(60).default("Donate"),
  trustNote: z.string().max(280).optional(),
  presentation: sectionPresentationSchema,
});

export type DonationFormV1 = z.infer<typeof donationFormSchemaV1>;
export const donationFormSchemasByVersion = { 1: donationFormSchemaV1 } as const;
