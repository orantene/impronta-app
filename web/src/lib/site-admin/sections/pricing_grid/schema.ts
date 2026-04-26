import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const planSchema = z.object({
  name: z.string().min(1).max(60),
  price: z.string().min(1).max(40),
  cadence: z.string().max(40).optional(),
  description: z.string().max(280).optional(),
  features: z.array(z.string().min(1).max(140)).min(1).max(20),
  ctaLabel: z.string().min(1).max(60),
  ctaHref: z.string().min(1).max(500),
  highlighted: z.boolean().default(false),
  badge: z.string().max(40).optional(),
});

export const pricingGridSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  plans: z.array(planSchema).min(1).max(4),
  variant: z.enum(["cards", "minimal", "bordered"]).default("cards"),
  presentation: sectionPresentationSchema,
});

export type PricingGridV1 = z.infer<typeof pricingGridSchemaV1>;
export type PricingPlan = z.infer<typeof planSchema>;
export const pricingGridSchemasByVersion = { 1: pricingGridSchemaV1 } as const;
