import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(500),
});

export const splitScreenSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().min(1).max(200),
  body: z.string().max(800).optional(),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),

  imageUrl: z.string().url().max(2048).optional(),
  imageAlt: z.string().max(200).optional(),
  videoUrl: z.string().url().max(2048).optional(),

  side: z.enum(["image-left", "image-right"]).default("image-left"),
  variant: z
    .enum(["50-50", "40-60", "60-40", "edge-to-edge"])
    .default("50-50"),
  verticalAlign: z.enum(["top", "center", "bottom"]).default("center"),
  stickyMedia: z.boolean().default(false),
  presentation: sectionPresentationSchema,
});

export type SplitScreenV1 = z.infer<typeof splitScreenSchemaV1>;

export const splitScreenSchemasByVersion = {
  1: splitScreenSchemaV1,
} as const;
