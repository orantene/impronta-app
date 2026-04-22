import { z } from "zod";

import { sectionPresentationSchema } from "../shared/presentation";

/**
 * Destinations mosaic — one oversized hero tile + 2–4 secondary tiles.
 * The Muse Bridal prototype uses this exact shape for the "From the
 * jungle to the Mediterranean" section.
 */

const destinationItemSchema = z.object({
  label: z.string().min(1).max(80),
  region: z.string().max(80).optional(),
  tagline: z.string().max(180).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  href: z.string().max(500).optional(),
});

export const destinationsMosaicSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  copy: z.string().max(400).optional(),
  /** First item renders as the oversized hero. Remaining items fill the 2-col grid. */
  items: z.array(destinationItemSchema).min(2).max(5),
  /** Italic-serif footnote (e.g. "International travel quoted per enquiry"). */
  footnote: z.string().max(200).optional(),
  /** Variant controls hero position + tile ratios. */
  variant: z
    .enum(["portrait-mosaic", "tile-grid", "map-inspired"])
    .default("portrait-mosaic"),
  /** M8 — shared presentation controls. */
  presentation: sectionPresentationSchema,
});

export type DestinationsMosaicV1 = z.infer<typeof destinationsMosaicSchemaV1>;
export type DestinationsMosaicItem = z.infer<typeof destinationItemSchema>;

export const destinationsMosaicSchemasByVersion = {
  1: destinationsMosaicSchemaV1,
} as const;
