import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Alternating image + copy blocks. Each item is one row; side alternates
 * automatically unless explicitly set. Used on the Services page in Muse
 * (8 service blocks with image left/right/left/right/...).
 */

const iconKeySchema = z.enum([
  "brush", "scissors", "camera", "film", "clipboard",
  "floral", "sparkle", "music", "ring", "pin",
  "calendar", "plane", "star", "circle", "square", "diamond",
]);

const itemSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140).describe("@rich"),
  italicTagline: z.string().max(180).optional(),
  body: z.string().max(640).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  /** Phase 10 — alt text for screen-readers. */
  imageAlt: z.string().max(200).optional(),
  iconKey: iconKeySchema.optional(),
  /** Optional "ideal for" bullet list. */
  listItems: z.array(z.string().max(120)).max(8).optional(),
  primaryCta: z
    .object({ label: z.string().min(1).max(60), href: z.string().min(1).max(500) })
    .optional(),
  secondaryCta: z
    .object({ label: z.string().min(1).max(60), href: z.string().min(1).max(500) })
    .optional(),
  side: z.enum(["auto", "image-left", "image-right"]).default("auto"),
});

export const imageCopyAlternatingSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  items: z.array(itemSchema).min(1).max(12),
  variant: z
    .enum(["editorial-alternating", "info-forward"])
    .default("editorial-alternating"),
  gap: z.enum(["tight", "standard", "airy"]).default("airy"),
  imageRatio: z.enum(["4/5", "1/1", "5/6", "3/4"]).default("5/6"),
  presentation: sectionPresentationSchema,
});

export type ImageCopyAlternatingV1 = z.infer<typeof imageCopyAlternatingSchemaV1>;
export type ImageCopyAlternatingItem = z.infer<typeof itemSchema>;

export const imageCopyAlternatingSchemasByVersion = {
  1: imageCopyAlternatingSchemaV1,
} as const;
