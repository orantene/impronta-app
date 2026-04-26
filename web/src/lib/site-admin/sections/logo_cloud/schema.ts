import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const logoSchema = z.object({
  imageUrl: z.string().url().max(2048),
  alt: z.string().min(1).max(120),
  href: z.string().max(500).optional(),
});

export const logoCloudSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  logos: z.array(logoSchema).min(2).max(40),
  columnsDesktop: z.number().int().min(3).max(8).default(6),
  variant: z.enum(["mono", "color", "muted"]).default("muted"),
  presentation: sectionPresentationSchema,
});

export type LogoCloudV1 = z.infer<typeof logoCloudSchemaV1>;
export type LogoCloudItem = z.infer<typeof logoSchema>;
export const logoCloudSchemasByVersion = { 1: logoCloudSchemaV1 } as const;
