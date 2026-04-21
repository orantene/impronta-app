import { z } from "zod";

export const heroSchemaV1 = z.object({
  headline: z.string().min(1).max(140),
  subheadline: z.string().max(240).optional(),
  primaryCta: z
    .object({
      label: z.string().min(1).max(60),
      href: z.string().min(1).max(500),
    })
    .optional(),
  secondaryCta: z
    .object({
      label: z.string().min(1).max(60),
      href: z.string().min(1).max(500),
    })
    .optional(),
  backgroundMediaAssetId: z.string().uuid().optional(),
});

export type HeroV1 = z.infer<typeof heroSchemaV1>;

export const heroSchemasByVersion = {
  1: heroSchemaV1,
} as const;
