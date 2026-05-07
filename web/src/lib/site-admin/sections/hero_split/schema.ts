import { z } from "zod";
import { nodePresentationSchema } from "../shared/node-presentation";
import { sectionPresentationSchema } from "../shared/presentation";

const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(500),
});

export const heroSplitSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().min(1).max(200),
  subheadline: z.string().max(400).optional(),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
  imageUrl: z.string().url().max(2048),
  imageAlt: z.string().max(200).optional(),
  side: z.enum(["media-right", "media-left"]).default("media-right"),
  variant: z.enum(["card", "fullbleed", "asymmetric"]).default("asymmetric"),
  nodePresentation: z
    .object({
      subheadline: nodePresentationSchema,
      headline: nodePresentationSchema,
      copy: nodePresentationSchema,
      primaryCta: nodePresentationSchema,
      secondaryCta: nodePresentationSchema,
    })
    .optional(),
  presentation: sectionPresentationSchema,
});

export type HeroSplitV1 = z.infer<typeof heroSplitSchemaV1>;
export const heroSplitSchemasByVersion = { 1: heroSplitSchemaV1 } as const;
