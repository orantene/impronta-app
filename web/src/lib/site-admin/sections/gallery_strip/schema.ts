import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Editorial gallery strip. Items cycle aspect ratios (wide/tall/square)
 * for the mosaic variant to avoid monotony. Caption is an italic serif
 * line under the strip.
 */
const itemSchema = z.object({
  src: z.string().url().max(2048),
  alt: z.string().max(160).optional(),
  aspect: z.enum(["wide", "tall", "square", "auto"]).default("auto"),
});

export const gallerySchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  items: z.array(itemSchema).min(3).max(16),
  variant: z
    .enum(["mosaic", "scroll-rail", "grid-uniform"])
    .default("mosaic"),
  caption: z.string().max(240).optional(),
  presentation: sectionPresentationSchema,
});

export type GalleryStripV1 = z.infer<typeof gallerySchemaV1>;
export type GalleryStripItem = z.infer<typeof itemSchema>;

export const gallerySchemasByVersion = { 1: gallerySchemaV1 } as const;
