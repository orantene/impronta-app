import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

const blockSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().max(800),
});

export const stickyScrollSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  imageUrl: z.string().url().max(2048),
  imageAlt: z.string().max(200).optional(),
  blocks: z.array(blockSchema).min(2).max(8),
  side: z.enum(["media-left", "media-right"]).default("media-left"),
  variant: z.enum(["bordered", "minimal"]).default("minimal"),
  presentation: sectionPresentationSchema,
});

export type StickyScrollV1 = z.infer<typeof stickyScrollSchemaV1>;
export type StickyScrollBlock = z.infer<typeof blockSchema>;
export const stickyScrollSchemasByVersion = { 1: stickyScrollSchemaV1 } as const;
